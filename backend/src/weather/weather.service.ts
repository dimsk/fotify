import {
  BadGatewayException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settings, WeatherOverlayMode } from '../settings/settings.entity';
import { DEFAULT_SETTINGS } from '../settings/settings-defaults';
import { UpdateWeatherSettingsDto } from './update-weather-settings.dto';

const SETTINGS_ID = 1;
const GEOCODING_BASE_URL = 'https://geocoding-api.open-meteo.com/v1';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const REQUEST_TIMEOUT_MS = 5000;

interface OpenMeteoLocation {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  timezone?: string;
  country?: string;
  admin1?: string;
}

interface OpenMeteoGeocodingResponse {
  results?: OpenMeteoLocation[];
}

interface OpenMeteoForecastResponse {
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    precipitation: number;
    weather_code: number;
    wind_speed_10m: number;
    is_day: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_sum: number[];
    precipitation_probability_max: number[];
  };
}

export interface WeatherLocationSuggestion {
  id: number;
  label: string;
  name: string;
  admin1: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
}

export interface WeatherSettingsResponse {
  enabled: boolean;
  mode: WeatherOverlayMode;
  forecastDays: number;
  refreshIntervalMinutes: number;
  location: WeatherLocationSuggestion | null;
}

export interface WeatherForecastResponse {
  visible: boolean;
  source: 'Open-Meteo';
  updatedAt: string | null;
  location: WeatherLocationSuggestion | null;
  current: {
    time: string;
    temperatureC: number;
    apparentTemperatureC: number;
    precipitationMm: number;
    weatherCode: number;
    condition: string;
    icon: WeatherIcon;
    windSpeedKmh: number;
    isDay: boolean;
  } | null;
  daily: Array<{
    date: string;
    weatherCode: number;
    condition: string;
    icon: WeatherIcon;
    temperatureMaxC: number;
    temperatureMinC: number;
    precipitationMm: number;
    precipitationProbability: number;
  }>;
}

export type WeatherIcon =
  | 'sun'
  | 'moon'
  | 'cloud-sun'
  | 'cloud'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm';

@Injectable()
export class WeatherService {
  private forecastCache: {
    key: string;
    expiresAt: number;
    value: WeatherForecastResponse;
  } | null = null;

  constructor(
    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,
  ) {}

  async searchLocations(query: string): Promise<WeatherLocationSuggestion[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const url = new URL(`${GEOCODING_BASE_URL}/search`);
    url.searchParams.set('name', trimmed);
    url.searchParams.set('count', '8');
    url.searchParams.set('language', 'de');
    url.searchParams.set('format', 'json');
    const data = await this.fetchJson<OpenMeteoGeocodingResponse>(url);
    return (data.results ?? []).map((location) => this.toSuggestion(location));
  }

  async getSettings(): Promise<WeatherSettingsResponse> {
    const settings = await this.getSettingsEntity();
    return {
      enabled: settings.weatherOverlayEnabled,
      mode: settings.weatherOverlayMode,
      forecastDays: settings.weatherForecastDays,
      refreshIntervalMinutes: settings.weatherRefreshIntervalMinutes,
      location: this.locationFromSettings(settings),
    };
  }

  async updateSettings(
    dto: UpdateWeatherSettingsDto,
  ): Promise<WeatherSettingsResponse> {
    const settings = await this.getSettingsEntity();
    const location =
      dto.locationId !== undefined
        ? await this.getLocationById(dto.locationId)
        : this.locationFromSettings(settings);

    if (dto.enabled && !location) {
      throw new BadRequestException(
        'Weather location is required when weather is enabled',
      );
    }

    settings.weatherOverlayEnabled = dto.enabled;
    settings.weatherOverlayMode = dto.mode;
    settings.weatherForecastDays = dto.forecastDays;
    settings.weatherRefreshIntervalMinutes = dto.refreshIntervalMinutes;

    if (location) {
      settings.weatherLocationId = location.id;
      settings.weatherLocationName = location.name;
      settings.weatherLocationAdmin1 = location.admin1;
      settings.weatherLocationCountry = location.country;
      settings.weatherLatitude = location.latitude;
      settings.weatherLongitude = location.longitude;
      settings.weatherTimezone = location.timezone;
    }

    await this.settingsRepo.save(settings);
    this.forecastCache = null;
    return this.getSettings();
  }

  async getForecast(): Promise<WeatherForecastResponse> {
    const settings = await this.getSettingsEntity();
    const location = this.locationFromSettings(settings);
    if (!settings.weatherOverlayEnabled || !location) {
      return this.emptyForecast(settings, location);
    }

    const key = `${location.id}:${settings.weatherForecastDays}`;
    const now = Date.now();
    if (
      this.forecastCache &&
      this.forecastCache.key === key &&
      this.forecastCache.expiresAt > now
    ) {
      return this.forecastCache.value;
    }

    const url = new URL(FORECAST_URL);
    url.searchParams.set('latitude', String(location.latitude));
    url.searchParams.set('longitude', String(location.longitude));
    url.searchParams.set(
      'current',
      'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day',
    );
    url.searchParams.set(
      'daily',
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max',
    );
    url.searchParams.set('forecast_days', String(settings.weatherForecastDays));
    url.searchParams.set('timezone', location.timezone ?? 'auto');

    const data = await this.fetchJson<OpenMeteoForecastResponse>(url);
    const value = this.mapForecast(settings, location, data);
    const cacheMs = settings.weatherRefreshIntervalMinutes * 60 * 1000;
    this.forecastCache = { key, expiresAt: now + cacheMs, value };
    return value;
  }

  private async getSettingsEntity(): Promise<Settings> {
    let settings = await this.settingsRepo.findOneBy({ id: SETTINGS_ID });
    if (!settings) {
      settings = this.settingsRepo.create({ id: SETTINGS_ID, ...DEFAULT_SETTINGS });
      await this.settingsRepo.save(settings);
    }
    return settings;
  }

  private async getLocationById(
    id: number,
  ): Promise<WeatherLocationSuggestion> {
    const url = new URL(`${GEOCODING_BASE_URL}/get`);
    url.searchParams.set('id', String(id));
    url.searchParams.set('language', 'de');
    url.searchParams.set('format', 'json');
    const location = await this.fetchJson<OpenMeteoLocation>(url);
    if (
      !location.id ||
      !location.name ||
      location.latitude === undefined ||
      location.longitude === undefined
    ) {
      throw new BadRequestException('Invalid weather location');
    }
    return this.toSuggestion(location);
  }

  private toSuggestion(location: OpenMeteoLocation): WeatherLocationSuggestion {
    const label = [location.name, location.admin1, location.country]
      .filter(Boolean)
      .join(', ');
    return {
      id: location.id,
      label,
      name: location.name,
      admin1: location.admin1 ?? null,
      country: location.country ?? null,
      latitude: location.latitude,
      longitude: location.longitude,
      timezone: location.timezone ?? null,
    };
  }

  private locationFromSettings(
    settings: Settings,
  ): WeatherLocationSuggestion | null {
    if (
      settings.weatherLocationId === null ||
      settings.weatherLocationName === null ||
      settings.weatherLatitude === null ||
      settings.weatherLongitude === null
    ) {
      return null;
    }
    return {
      id: settings.weatherLocationId,
      label: [
        settings.weatherLocationName,
        settings.weatherLocationAdmin1,
        settings.weatherLocationCountry,
      ]
        .filter(Boolean)
        .join(', '),
      name: settings.weatherLocationName,
      admin1: settings.weatherLocationAdmin1,
      country: settings.weatherLocationCountry,
      latitude: settings.weatherLatitude,
      longitude: settings.weatherLongitude,
      timezone: settings.weatherTimezone,
    };
  }

  private mapForecast(
    settings: Settings,
    location: WeatherLocationSuggestion,
    data: OpenMeteoForecastResponse,
  ): WeatherForecastResponse {
    return {
      visible: settings.weatherOverlayEnabled,
      source: 'Open-Meteo',
      updatedAt: new Date().toISOString(),
      location,
      current: {
        time: data.current.time,
        temperatureC: data.current.temperature_2m,
        apparentTemperatureC: data.current.apparent_temperature,
        precipitationMm: data.current.precipitation,
        weatherCode: data.current.weather_code,
        condition: weatherCondition(data.current.weather_code),
        icon: weatherIcon(data.current.weather_code, data.current.is_day === 1),
        windSpeedKmh: data.current.wind_speed_10m,
        isDay: data.current.is_day === 1,
      },
      daily: data.daily.time.map((date, index) => ({
        date,
        weatherCode: data.daily.weather_code[index],
        condition: weatherCondition(data.daily.weather_code[index]),
        icon: weatherIcon(data.daily.weather_code[index], true),
        temperatureMaxC: data.daily.temperature_2m_max[index],
        temperatureMinC: data.daily.temperature_2m_min[index],
        precipitationMm: data.daily.precipitation_sum[index],
        precipitationProbability:
          data.daily.precipitation_probability_max[index] ?? 0,
      })),
    };
  }

  private emptyForecast(
    settings: Settings,
    location: WeatherLocationSuggestion | null,
  ): WeatherForecastResponse {
    return {
      visible: false,
      source: 'Open-Meteo',
      updatedAt: null,
      location,
      current: null,
      daily: [],
    };
  }

  private async fetchJson<T>(url: URL): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new BadGatewayException(
          `Weather provider returned ${response.status}`,
        );
      }
      return (await response.json()) as T;
    } catch (err) {
      if (
        err instanceof BadGatewayException ||
        err instanceof BadRequestException
      ) {
        throw err;
      }
      throw new BadGatewayException('Weather provider is not reachable');
    } finally {
      clearTimeout(timeout);
    }
  }
}

function weatherCondition(code: number): string {
  if (code === 0) return 'Klar';
  if (code === 1) return 'Überwiegend klar';
  if (code === 2) return 'Teilweise bewölkt';
  if (code === 3) return 'Bewölkt';
  if (code === 45 || code === 48) return 'Nebel';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Nieselregen';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Regen';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Schnee';
  if ([95, 96, 99].includes(code)) return 'Gewitter';
  return 'Wetter';
}

function weatherIcon(code: number, isDay: boolean): WeatherIcon {
  if (code === 0) return isDay ? 'sun' : 'moon';
  if (code === 1 || code === 2) return 'cloud-sun';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'storm';
  return 'cloud';
}

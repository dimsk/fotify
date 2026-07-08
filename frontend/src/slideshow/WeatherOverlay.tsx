import { useEffect, useState } from 'react';
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudRain,
  CloudSnow,
  CloudSun,
  CloudLightning,
  Moon,
  Sun,
  Umbrella,
  Wind,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  WeatherForecast,
  WeatherIcon,
  WeatherOverlayMode,
} from '../api/types';
import styles from './WeatherOverlay.module.css';

const WEATHER_REFRESH_MS = 15 * 60 * 1000;

interface WeatherOverlayProps {
  enabled: boolean;
  mode: WeatherOverlayMode;
  timedVisible: boolean;
}

const DAY_FORMATTER = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });

const ICONS: Record<WeatherIcon, typeof Sun> = {
  sun: Sun,
  moon: Moon,
  'cloud-sun': CloudSun,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

export function WeatherOverlay({
  enabled,
  mode,
  timedVisible,
}: WeatherOverlayProps) {
  const [forecast, setForecast] = useState<WeatherForecast | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      api.weather
        .forecast()
        .then((data) => {
          if (!cancelled) setForecast(data);
        })
        .catch(() => undefined);
    };
    refresh();
    const interval = setInterval(refresh, WEATHER_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [enabled]);

  if (!forecast?.visible || !forecast.current || !forecast.location)
    return null;

  const visible = enabled && (mode === 'always' || timedVisible);
  const CurrentIcon = ICONS[forecast.current.icon];

  return (
    <div
      className={`${styles.card} ${visible ? styles.visible : ''}`}
      aria-hidden={!visible}
    >
      <div className={styles.header}>
        <div>
          <span className={styles.place}>{forecast.location.name}</span>
          <span className={styles.condition}>{forecast.current.condition}</span>
        </div>
        <div className={styles.current}>
          <CurrentIcon className={styles.currentIcon} strokeWidth={1.8} />
          <span className={styles.temperature}>
            {Math.round(forecast.current.temperatureC)}°
          </span>
        </div>
      </div>

      <div className={styles.meta}>
        <span>
          Gefühlt {Math.round(forecast.current.apparentTemperatureC)}°
        </span>
        <span>
          <Wind size={13} /> {Math.round(forecast.current.windSpeedKmh)} km/h
        </span>
        <span>
          <Umbrella size={13} /> {formatRain(forecast.current.precipitationMm)}
        </span>
      </div>

      <div className={styles.forecast}>
        {forecast.daily.slice(0, 4).map((day) => {
          const DayIcon = ICONS[day.icon];
          return (
            <div key={day.date} className={styles.day}>
              <span className={styles.dayName}>
                {DAY_FORMATTER.format(new Date(day.date))}
              </span>
              <DayIcon className={styles.dayIcon} strokeWidth={1.8} />
              <span className={styles.dayTemp}>
                {Math.round(day.temperatureMinC)}° /{' '}
                {Math.round(day.temperatureMaxC)}°
              </span>
              <span className={styles.rain}>
                {day.precipitationProbability}% ·{' '}
                {formatRain(day.precipitationMm)}
              </span>
            </div>
          );
        })}
      </div>

      <span className={styles.source}>Open-Meteo</span>
    </div>
  );
}

function formatRain(value: number): string {
  return value < 0.05 ? '0 mm' : `${value.toFixed(1)} mm`;
}

import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { WeatherOverlayMode } from '../settings/settings.entity';

const WEATHER_OVERLAY_MODES: WeatherOverlayMode[] = ['always', 'sometimes'];

export class UpdateWeatherSettingsDto {
  @IsBoolean()
  enabled: boolean;

  @IsIn(WEATHER_OVERLAY_MODES)
  mode: WeatherOverlayMode;

  @IsInt()
  @Min(3)
  @Max(7)
  forecastDays: number;

  @IsOptional()
  @IsInt()
  locationId?: number;
}

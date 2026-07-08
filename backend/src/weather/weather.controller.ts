import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { WeatherService } from './weather.service';
import { UpdateWeatherSettingsDto } from './update-weather-settings.dto';

@Controller('weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get('locations')
  searchLocations(@Query('q') query = '') {
    return this.weatherService.searchLocations(query);
  }

  @Get('settings')
  settings() {
    return this.weatherService.getSettings();
  }

  @Put('settings')
  updateSettings(@Body() dto: UpdateWeatherSettingsDto) {
    return this.weatherService.updateSettings(dto);
  }

  @Get('forecast')
  forecast() {
    return this.weatherService.getForecast();
  }
}

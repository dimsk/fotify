import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { dataSourceOptions } from './database/data-source';
import { SourcesModule } from './sources/sources.module';
import { PhotosModule } from './photos/photos.module';
import { MediaModule } from './media/media.module';
import { SettingsModule } from './settings/settings.module';
import { ScanModule } from './scan/scan.module';
import { FileProvidersModule } from './file-providers/file-providers.module';
import { CalendarModule } from './calendar/calendar.module';
import { WeatherModule } from './weather/weather.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot(dataSourceOptions),
    FileProvidersModule,
    SourcesModule,
    PhotosModule,
    MediaModule,
    SettingsModule,
    ScanModule,
    CalendarModule,
    WeatherModule,
  ],
})
export class AppModule {}

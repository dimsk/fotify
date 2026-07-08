import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CalendarAccount } from './calendar-account.entity';
import { Calendar } from './calendar.entity';
import { CalendarEvent } from './calendar-event.entity';
import { GoogleOAuthConfig } from './google-oauth-config.entity';
import { Settings } from '../settings/settings.entity';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { CalendarSyncService } from './calendar-sync.service';
import { GoogleOAuthStateService } from './google-oauth-state.service';
import { GoogleOAuthConfigService } from './google-oauth-config.service';

@Module({
  imports: [TypeOrmModule.forFeature([CalendarAccount, Calendar, CalendarEvent, GoogleOAuthConfig, Settings])],
  controllers: [CalendarController],
  providers: [CalendarService, CalendarSyncService, GoogleOAuthStateService, GoogleOAuthConfigService],
})
export class CalendarModule {}

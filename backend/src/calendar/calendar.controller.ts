import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CalendarService } from './calendar.service';
import { ConnectAppleAccountDto } from './dto/connect-apple-account.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';
import { UpdateGoogleOAuthConfigDto } from './dto/update-google-oauth-config.dto';

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendarService: CalendarService) {}

  @Get('accounts')
  listAccounts() {
    return this.calendarService.listAccounts();
  }

  @Post('accounts/apple')
  connectApple(@Body() dto: ConnectAppleAccountDto) {
    return this.calendarService.connectApple(dto);
  }

  @Delete('accounts/:id')
  @HttpCode(204)
  async disconnect(@Param('id', ParseIntPipe) id: number) {
    await this.calendarService.disconnectAccount(id);
  }

  @Post('accounts/:id/resync')
  @HttpCode(202)
  async resync(@Param('id', ParseIntPipe) id: number) {
    await this.calendarService.resyncAccount(id);
  }

  @Get('google/config')
  getGoogleConfig() {
    return this.calendarService.getGoogleConfigStatus();
  }

  @Put('google/config')
  updateGoogleConfig(@Body() dto: UpdateGoogleOAuthConfigDto) {
    return this.calendarService.updateGoogleConfig(dto);
  }

  // Must be a real browser navigation (window.open on the frontend, opened
  // in a new tab), not a fetch() call — this redirects to Google's own
  // consent screen, which then redirects back to google/callback below. Wrapped in
  // try/catch so a misconfigured deployment (e.g. Google credentials not
  // saved yet) sends the admin back to the Calendar page with a clear
  // error instead of dead-ending on a raw 500 at this URL.
  @Get('google/connect')
  async connectGoogle(@Res() res: Response) {
    try {
      res.redirect(await this.calendarService.buildGoogleConnectUrl());
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      res.redirect(`/admin/calendar?connected=error&message=${encodeURIComponent(message)}`);
    }
  }

  @Get('google/callback')
  async googleCallback(@Query('code') code: string, @Query('state') state: string, @Res() res: Response) {
    try {
      await this.calendarService.handleGoogleCallback(code, state);
      res.redirect(`/admin/calendar?connected=google`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      res.redirect(`/admin/calendar?connected=error&message=${encodeURIComponent(message)}`);
    }
  }

  @Get('accounts/:id/calendars')
  listCalendars(@Param('id', ParseIntPipe) id: number) {
    return this.calendarService.listCalendarsForAccount(id);
  }

  @Patch('calendars/:id')
  updateCalendar(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCalendarDto) {
    return this.calendarService.updateCalendar(id, dto);
  }

  @Get('today')
  getToday() {
    return this.calendarService.getToday();
  }
}

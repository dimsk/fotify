import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CalendarAccount } from './calendar-account.entity';
import { Calendar } from './calendar.entity';
import { CalendarEvent } from './calendar-event.entity';
import { Settings } from '../settings/settings.entity';
import { CalendarSyncService } from './calendar-sync.service';
import { GoogleOAuthStateService } from './google-oauth-state.service';
import { GoogleOAuthConfigService, GoogleOAuthConfigStatus } from './google-oauth-config.service';
import { ConnectAppleAccountDto } from './dto/connect-apple-account.dto';
import { UpdateCalendarDto } from './dto/update-calendar.dto';
import { UpdateGoogleOAuthConfigDto } from './dto/update-google-oauth-config.dto';
import { encryptSecretOrThrow } from './encrypt-or-throw.util';
import { isWithinTimeWindow } from '../common/time-window.util';
import { buildGoogleAuthUrl, exchangeGoogleAuthCode, getRedirectUri, listGoogleCalendars } from './google-oauth.util';
import { createAppleDavClient, verifyAppleCredentials } from './apple-caldav.util';

const SETTINGS_ID = 1;

export interface CalendarTodayEvent {
  id: number;
  calendarId: number;
  calendarName: string;
  color: string;
  important: boolean;
  title: string;
  isAllDay: boolean;
  startAt: string;
  endAt: string;
  day: 'today' | 'tomorrow';
  location: string | null;
}

export interface CalendarTodayResponse {
  visible: boolean;
  events: CalendarTodayEvent[];
}

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(CalendarAccount) private readonly accountRepo: Repository<CalendarAccount>,
    @InjectRepository(Calendar) private readonly calendarRepo: Repository<Calendar>,
    @InjectRepository(CalendarEvent) private readonly eventRepo: Repository<CalendarEvent>,
    @InjectRepository(Settings) private readonly settingsRepo: Repository<Settings>,
    private readonly calendarSync: CalendarSyncService,
    private readonly oauthState: GoogleOAuthStateService,
    private readonly googleOAuthConfig: GoogleOAuthConfigService,
  ) {}

  async listAccounts() {
    const accounts = await this.accountRepo.find({ order: { createdAt: 'DESC' } });
    return accounts.map(
      ({ googleAccessTokenEnc, googleRefreshTokenEnc, applePasswordEnc, ...safe }) => safe,
    );
  }

  async connectApple(dto: ConnectAppleAccountDto) {
    const client = createAppleDavClient(dto.appleId, dto.appPassword);
    await verifyAppleCredentials(client);

    const account = await this.accountRepo.save(
      this.accountRepo.create({
        provider: 'apple',
        label: dto.label,
        appleId: dto.appleId,
        applePasswordEnc: encryptSecretOrThrow(dto.appPassword),
        status: 'idle',
      }),
    );
    this.calendarSync.triggerSync(account.id);
    const { applePasswordEnc, ...safe } = account;
    return safe;
  }

  async disconnectAccount(id: number): Promise<void> {
    const result = await this.accountRepo.delete(id);
    if (result.affected === 0) throw new NotFoundException('Calendar account not found');
  }

  async resyncAccount(id: number): Promise<void> {
    const account = await this.accountRepo.findOneBy({ id });
    if (!account) throw new NotFoundException('Calendar account not found');
    this.calendarSync.triggerSync(id);
  }

  getGoogleConfigStatus(): Promise<GoogleOAuthConfigStatus> {
    return this.googleOAuthConfig.getStatus();
  }

  updateGoogleConfig(dto: UpdateGoogleOAuthConfigDto): Promise<GoogleOAuthConfigStatus> {
    return this.googleOAuthConfig.save(dto.clientId, dto.publicUrl, dto.clientSecret);
  }

  async buildGoogleConnectUrl(): Promise<string> {
    const { clientId, publicUrl } = await this.googleOAuthConfig.getCredentials();
    const state = this.oauthState.create();
    return buildGoogleAuthUrl(clientId, getRedirectUri(publicUrl), state);
  }

  async handleGoogleCallback(code: string, state: string): Promise<void> {
    if (!this.oauthState.consume(state)) {
      throw new BadRequestException('OAuth-Anfrage ist ungültig oder abgelaufen. Bitte erneut versuchen.');
    }
    const { clientId, clientSecret, publicUrl } = await this.googleOAuthConfig.getCredentials();
    const tokens = await exchangeGoogleAuthCode(clientId, clientSecret, getRedirectUri(publicUrl), code);
    if (!tokens.refreshToken) {
      throw new BadRequestException(
        'Google hat kein Refresh-Token zurückgegeben. Bitte den Zugriff unter myaccount.google.com/permissions widerrufen und erneut verbinden.',
      );
    }
    const calendars = await listGoogleCalendars(tokens.accessToken);
    const primary = calendars.find((c) => c.primaryEmail) ?? calendars[0];

    const account = await this.accountRepo.save(
      this.accountRepo.create({
        provider: 'google',
        label: primary?.primaryEmail ?? primary?.name ?? 'Google-Konto',
        googleEmail: primary?.primaryEmail ?? null,
        googleAccessTokenEnc: encryptSecretOrThrow(tokens.accessToken),
        googleRefreshTokenEnc: encryptSecretOrThrow(tokens.refreshToken),
        googleAccessTokenExpiresAt: tokens.expiresAt,
        status: 'idle',
      }),
    );
    this.calendarSync.triggerSync(account.id);
  }

  async listCalendarsForAccount(accountId: number): Promise<Calendar[]> {
    return this.calendarRepo.find({ where: { accountId }, order: { name: 'ASC' } });
  }

  async updateCalendar(id: number, dto: UpdateCalendarDto): Promise<Calendar> {
    const calendar = await this.calendarRepo.findOneBy({ id });
    if (!calendar) throw new NotFoundException('Calendar not found');

    const wasEnabled = calendar.enabled;
    Object.assign(calendar, dto);
    const saved = await this.calendarRepo.save(calendar);

    if (dto.enabled && !wasEnabled) {
      this.calendarSync.triggerCalendarSync(saved.id);
    }
    return saved;
  }

  async getToday(): Promise<CalendarTodayResponse> {
    const settings = await this.settingsRepo.findOneBy({ id: SETTINGS_ID });
    if (!settings?.calendarOverlayEnabled) return { visible: false, events: [] };
    if (!isWithinTimeWindow(new Date(), settings.calendarOverlayStart, settings.calendarOverlayEnd)) {
      return { visible: false, events: [] };
    }

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const startOfDayAfterTomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);

    const [todayEvents, tomorrowEvents] = await Promise.all([
      this.queryEventsInRange(startOfToday, startOfTomorrow),
      this.queryEventsInRange(startOfTomorrow, startOfDayAfterTomorrow),
    ]);

    return {
      visible: true,
      events: [
        ...todayEvents.map((event) => this.toTodayEvent(event, 'today')),
        ...tomorrowEvents.map((event) => this.toTodayEvent(event, 'tomorrow')),
      ],
    };
  }

  /** Events from enabled calendars overlapping [start, end), all-day first then chronological. */
  private queryEventsInRange(start: Date, end: Date): Promise<CalendarEvent[]> {
    return this.eventRepo
      .createQueryBuilder('event')
      .innerJoinAndSelect('event.calendar', 'calendar')
      .where('calendar.enabled = 1')
      .andWhere('event.startAt < :end', { end })
      .andWhere('event.endAt >= :start', { start })
      .orderBy('event.isAllDay', 'DESC')
      .addOrderBy('event.startAt', 'ASC')
      .getMany();
  }

  private toTodayEvent(event: CalendarEvent, day: 'today' | 'tomorrow'): CalendarTodayEvent {
    return {
      id: event.id,
      calendarId: event.calendarId,
      calendarName: event.calendar.name,
      color: event.importantColor ?? event.calendar.color,
      important: event.importantColor !== null,
      title: event.title,
      isAllDay: event.isAllDay,
      startAt: event.startAt.toISOString(),
      endAt: event.endAt.toISOString(),
      day,
      location: event.location,
    };
  }
}

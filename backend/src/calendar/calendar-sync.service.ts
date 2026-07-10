import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import type { DAVClient } from 'tsdav';
import { CalendarAccount } from './calendar-account.entity';
import { Calendar } from './calendar.entity';
import { CalendarEvent } from './calendar-event.entity';
import { GoogleOAuthConfigService } from './google-oauth-config.service';
import { decryptSecret } from '../file-providers/smb-credentials.util';
import { encryptSecretOrThrow } from './encrypt-or-throw.util';
import { Settings } from '../settings/settings.entity';
import {
  GoogleEventParsed,
  listGoogleCalendars,
  listGoogleEvents,
  refreshGoogleAccessToken,
} from './google-oauth.util';
import {
  ParsedIcsEvent,
  createAppleDavClient,
  discoverAppleCalendars,
  fetchAppleEvents,
  parseIcsEvents,
} from './apple-caldav.util';

/** Cycled through for newly-discovered calendars with no provider-reported color. */
const DEFAULT_CALENDAR_PALETTE = [
  '#4285f4',
  '#0b8043',
  '#e67c73',
  '#f6bf26',
  '#8e24aa',
  '#039be5',
  '#c2185b',
  '#616161',
];

type ProviderContext =
  | { provider: 'google'; accessToken: string }
  | { provider: 'apple'; client: DAVClient };

interface RemoteCalendar {
  externalId: string;
  name: string;
  providerColor: string | null;
}

/**
 * Refreshes the local read-cache (Calendar/CalendarEvent) from Google/iCloud.
 * The kiosk-facing /calendar/today endpoint never talks to a provider
 * directly — it only ever reads what this service has cached.
 */
@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    @InjectRepository(CalendarAccount) private readonly accountRepo: Repository<CalendarAccount>,
    @InjectRepository(Calendar) private readonly calendarRepo: Repository<Calendar>,
    @InjectRepository(CalendarEvent) private readonly eventRepo: Repository<CalendarEvent>,
    @InjectRepository(Settings) private readonly settingsRepo: Repository<Settings>,
    private readonly googleOAuthConfig: GoogleOAuthConfigService,
  ) {}

  @Cron('* * * * *')
  async handleScheduledSync(): Promise<void> {
    const settings = await this.settingsRepo.findOneBy({ id: 1 });
    const intervalMinutes = settings?.calendarSyncIntervalMinutes ?? 15;
    const accounts = await this.accountRepo.find();
    // Sequential, not Promise.all — one account with a revoked grant or a
    // bad password must not abort the rest.
    for (const account of accounts) {
      if (!this.shouldSyncAccount(account, intervalMinutes)) continue;
      await this.syncAccount(account.id);
    }
  }

  /** Fire-and-forget immediate sync — e.g. right after connecting an account or a manual "resync" click. */
  triggerSync(accountId: number): void {
    this.syncAccount(accountId).catch((err) =>
      this.logger.error(`Unexpected error syncing calendar account ${accountId}`, err),
    );
  }

  /** Fire-and-forget immediate event sync for one calendar — e.g. right after the admin enables it. */
  triggerCalendarSync(calendarId: number): void {
    this.syncSingleCalendar(calendarId).catch((err) =>
      this.logger.error(`Unexpected error syncing calendar ${calendarId}`, err),
    );
  }

  /** Discovers calendars + refreshes cached events for every enabled calendar of one account. Never throws. */
  async syncAccount(accountId: number): Promise<void> {
    const account = await this.accountRepo.findOneBy({ id: accountId });
    if (!account) {
      this.logger.warn(`syncAccount called for unknown calendar account ${accountId}`);
      return;
    }

    this.logger.log(`Sync starting for account ${accountId} (${account.provider}, "${account.label}")`);
    await this.accountRepo.update(accountId, { status: 'syncing' });
    try {
      const ctx = await this.buildProviderContext(account);
      this.logger.log(`Account ${accountId}: authenticated with ${account.provider}, discovering calendars`);

      const remoteCalendars =
        ctx.provider === 'google'
          ? await listGoogleCalendars(ctx.accessToken)
          : await discoverAppleCalendars(ctx.client);
      this.logger.log(
        `Account ${accountId}: discovered ${remoteCalendars.length} calendar(s): ${remoteCalendars.map((c) => c.name).join(', ') || '(none)'}`,
      );
      const calendars = await this.upsertCalendars(accountId, remoteCalendars);

      const enabledCalendars = calendars.filter((c) => c.enabled);
      this.logger.log(
        `Account ${accountId}: syncing events for ${enabledCalendars.length} enabled calendar(s) (${calendars.length - enabledCalendars.length} disabled, skipped)`,
      );
      const { start, end } = syncWindow();
      const failedCalendars: string[] = [];
      let syncedCalendars = 0;
      for (const calendar of enabledCalendars) {
        try {
          await this.syncCalendarEvents(ctx, calendar, start, end);
          syncedCalendars += 1;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          failedCalendars.push(`${calendar.name}: ${message}`);
          this.logger.warn(
            `Calendar ${calendar.id} ("${calendar.name}") sync failed: ${message}`,
          );
        }
      }

      if (failedCalendars.length > 0 && syncedCalendars === 0 && enabledCalendars.length > 0) {
        throw new Error(failedCalendars.join('; '));
      }

      const partialError =
        failedCalendars.length > 0
          ? `Einige Kalender konnten nicht synchronisiert werden: ${failedCalendars.join('; ')}`
          : null;
      await this.accountRepo.update(accountId, {
        status: 'idle',
        lastSyncError: partialError,
        lastSyncedAt: new Date(),
      });
      this.logger.log(
        `Sync completed for account ${accountId}` +
          (failedCalendars.length > 0 ? ` with ${failedCalendars.length} calendar failure(s)` : ''),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Sync failed for calendar account ${accountId} (${account.provider}): ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      await this.accountRepo.update(accountId, { status: 'error', lastSyncError: message });
    }
  }

  /** Refreshes just one already-discovered calendar's events immediately (e.g. right after the admin enables it). */
  async syncSingleCalendar(calendarId: number): Promise<void> {
    const calendar = await this.calendarRepo.findOne({ where: { id: calendarId }, relations: ['account'] });
    if (!calendar?.enabled) {
      this.logger.warn(`syncSingleCalendar called for calendar ${calendarId}, which is missing or disabled`);
      return;
    }
    try {
      const ctx = await this.buildProviderContext(calendar.account);
      const { start, end } = syncWindow();
      await this.syncCalendarEvents(ctx, calendar, start, end);
      // Mirrors syncAccount()'s success bookkeeping so the account's status
      // badge reflects this too, not just full-account resyncs.
      await this.accountRepo.update(calendar.accountId, {
        status: 'idle',
        lastSyncError: null,
        lastSyncedAt: new Date(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Event sync failed for calendar ${calendarId} ("${calendar.name}"): ${message}`,
        err instanceof Error ? err.stack : undefined,
      );
      // Without this, a failure here was previously invisible in the admin
      // UI — the account row would just silently stay unchanged forever.
      await this.accountRepo.update(calendar.accountId, { status: 'error', lastSyncError: message });
    }
  }

  private async buildProviderContext(account: CalendarAccount): Promise<ProviderContext> {
    if (account.provider === 'google') {
      return { provider: 'google', accessToken: await this.ensureGoogleAccessToken(account) };
    }
    this.logger.log(`Account ${account.id}: logging into iCloud CalDAV as ${account.appleId}`);
    const client = createAppleDavClient(
      account.appleId,
      this.decryptStoredSecret(account, 'Apple app password', account.applePasswordEnc),
    );
    try {
      await client.login();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`iCloud CalDAV login failed for ${account.appleId}: ${message}`);
    }
    this.logger.log(`Account ${account.id}: iCloud CalDAV login succeeded`);
    return { provider: 'apple', client };
  }

  private async ensureGoogleAccessToken(account: CalendarAccount): Promise<string> {
    const expiresAt = account.googleAccessTokenExpiresAt ? new Date(account.googleAccessTokenExpiresAt).getTime() : 0;
    if (account.googleAccessTokenEnc && expiresAt - 60_000 > Date.now()) {
      return this.decryptStoredSecret(account, 'Google access token', account.googleAccessTokenEnc);
    }
    const { clientId, clientSecret } = await this.googleOAuthConfig.getCredentials();
    const tokens = await refreshGoogleAccessToken(
      clientId,
      clientSecret,
      this.decryptStoredSecret(account, 'Google refresh token', account.googleRefreshTokenEnc),
    );
    await this.accountRepo.update(account.id, {
      googleAccessTokenEnc: encryptSecretOrThrow(tokens.accessToken),
      googleAccessTokenExpiresAt: tokens.expiresAt,
    });
    return tokens.accessToken;
  }

  private decryptStoredSecret(
    account: CalendarAccount,
    secretLabel: string,
    encoded: string | null,
  ): string {
    if (!encoded) {
      throw new Error(`${secretLabel} fehlt für Konto ${account.id}`);
    }
    try {
      return decryptSecret(encoded);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/authenticate data|authentication tag|unsupported state/i.test(message)) {
        throw new Error(
          `${secretLabel} konnte nicht entschlüsselt werden. ` +
            `Wahrscheinlich passt die aktuelle /app/data/encryption.key nicht mehr zur Datenbank. ` +
            `Bitte Konto neu verbinden und sicherstellen, dass /app/data/encryption.key persistent erhalten bleibt.`,
        );
      }
      throw err;
    }
  }

  private shouldSyncAccount(account: CalendarAccount, intervalMinutes: number): boolean {
    if (account.status === 'syncing') return false;
    if (!account.lastSyncedAt) return true;
    const lastSync = new Date(account.lastSyncedAt).getTime();
    return Date.now() - lastSync >= intervalMinutes * 60_000;
  }

  private async upsertCalendars(accountId: number, remote: RemoteCalendar[]): Promise<Calendar[]> {
    const existing = await this.calendarRepo.find({ where: { accountId } });
    const result: Calendar[] = [];
    for (const r of remote) {
      let calendar = existing.find((c) => c.externalId === r.externalId);
      if (calendar) {
        calendar.name = r.name;
        calendar.providerColor = r.providerColor;
        calendar = await this.calendarRepo.save(calendar);
      } else {
        calendar = await this.calendarRepo.save(
          this.calendarRepo.create({
            accountId,
            externalId: r.externalId,
            name: r.name,
            providerColor: r.providerColor,
            color: r.providerColor ?? DEFAULT_CALENDAR_PALETTE[existing.length % DEFAULT_CALENDAR_PALETTE.length],
            enabled: false,
          }),
        );
        existing.push(calendar);
      }
      result.push(calendar);
    }
    return result;
  }

  private async syncCalendarEvents(ctx: ProviderContext, calendar: Calendar, start: Date, end: Date): Promise<void> {
    const syncRunAt = new Date();
    let parsed: (GoogleEventParsed | ParsedIcsEvent)[];

    if (ctx.provider === 'google') {
      parsed = await listGoogleEvents(ctx.accessToken, calendar.externalId, start, end);
    } else {
      const icsObjects = await fetchAppleEvents(ctx.client, calendar.externalId, start, end);
      this.logger.log(
        `Calendar ${calendar.id} ("${calendar.name}"): fetched ${icsObjects.length} raw ICS object(s) from iCloud for ${start.toISOString()}..${end.toISOString()}`,
      );
      parsed = icsObjects.flatMap(parseIcsEvents);
    }
    this.logger.log(`Calendar ${calendar.id} ("${calendar.name}"): parsed ${parsed.length} event instance(s) in window`);

    for (const ev of parsed) {
      const existing = await this.eventRepo.findOne({
        where: { calendarId: calendar.id, externalId: ev.externalId },
      });
      if (existing) {
        Object.assign(existing, ev, { lastSeenAt: syncRunAt });
        await this.eventRepo.save(existing);
      } else {
        await this.eventRepo.save(this.eventRepo.create({ ...ev, calendarId: calendar.id, lastSeenAt: syncRunAt }));
      }
    }

    // Removes cancelled/expired events without needing provider sync-tokens.
    const swept = await this.eventRepo
      .createQueryBuilder()
      .delete()
      .where('calendarId = :calendarId', { calendarId: calendar.id })
      .andWhere('lastSeenAt < :syncRunAt', { syncRunAt })
      .execute();
    if (swept.affected) {
      this.logger.log(`Calendar ${calendar.id} ("${calendar.name}"): removed ${swept.affected} stale cached event(s)`);
    }
  }
}

/** [yesterday, today+2) local time — wide enough to safely cover "today" across timezones/DST. */
function syncWindow(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  return { start, end };
}

import { BadRequestException } from '@nestjs/common';
import { DAVClient } from 'tsdav';
import ICAL from 'ical.js';

const APPLE_CALDAV_SERVER_URL = 'https://caldav.icloud.com';

export interface DiscoveredCalendar {
  externalId: string;
  name: string;
  providerColor: string | null;
}

export interface ParsedIcsEvent {
  externalId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
  importantColor: string | null;
  rawColorId: string | null;
  location: string | null;
}

export function createAppleDavClient(appleId: string, appPassword: string): DAVClient {
  return new DAVClient({
    serverUrl: APPLE_CALDAV_SERVER_URL,
    credentials: { username: appleId, password: appPassword },
    authMethod: 'Basic',
    defaultAccountType: 'caldav',
  });
}

/** Synchronous validation step for the "add Apple account" form — fails fast on a bad app-specific password. */
export async function verifyAppleCredentials(client: DAVClient): Promise<void> {
  try {
    await client.login();
  } catch {
    throw new BadRequestException(
      'Anmeldung fehlgeschlagen. Bitte Apple-ID und App-spezifisches Passwort prüfen.',
    );
  }
}

export async function discoverAppleCalendars(client: DAVClient): Promise<DiscoveredCalendar[]> {
  const calendars = await client.fetchCalendars();
  return calendars
    .filter((cal) => !cal.components || cal.components.includes('VEVENT'))
    .map((cal) => ({
      externalId: cal.url,
      name: typeof cal.displayName === 'string' && cal.displayName ? cal.displayName : cal.url,
      providerColor: cal.calendarColor ?? null,
    }));
}

/**
 * Fetches raw ICS text for events in [timeMin, timeMax) on the given
 * calendar. Requests server-side RRULE expansion (expand:true) — the same
 * intent as Google's singleEvents=true — so recurring events arrive as
 * concrete instances rather than a single master this code doesn't expand
 * itself. Best-effort: not every CalDAV server honors `expand` equally well.
 */
export async function fetchAppleEvents(
  client: DAVClient,
  calendarUrl: string,
  timeMin: Date,
  timeMax: Date,
): Promise<string[]> {
  const objects = await client.fetchCalendarObjects({
    calendar: { url: calendarUrl },
    timeRange: { start: timeMin.toISOString(), end: timeMax.toISOString() },
    expand: true,
  });
  return objects.map((o) => o.data).filter((data): data is string => typeof data === 'string');
}

/**
 * Parses every VEVENT out of one ICS object — a recurring event expanded
 * server-side yields multiple VEVENTs sharing one UID, so each instance's
 * externalId is disambiguated with its start time.
 */
export function parseIcsEvents(icsText: string): ParsedIcsEvent[] {
  const jcal = ICAL.parse(icsText);
  const comp = new ICAL.Component(jcal);
  const vevents = comp.getAllSubcomponents('vevent');

  return vevents.map((vevent) => {
    const event = new ICAL.Event(vevent);
    const rawColor = event.color || null;
    return {
      externalId: `${event.uid}-${event.startDate.toUnixTime()}`,
      title: event.summary || '(Ohne Titel)',
      startAt: event.startDate.toJSDate(),
      endAt: event.endDate.toJSDate(),
      isAllDay: event.startDate.isDate,
      importantColor: rawColor ? normalizeCssColor(rawColor) : null,
      rawColorId: rawColor,
      location: event.location?.trim() || null,
    };
  });
}

/**
 * The RFC 7986 COLOR property may be a CSS3 extended color keyword (e.g.
 * "tomato") rather than a hex value — Calendar.app writes either. Only the
 * handful of keywords plausible for a calendar color are mapped; anything
 * already hex-shaped is passed through as-is.
 */
const CSS_COLOR_KEYWORDS: Record<string, string> = {
  red: '#ff0000',
  tomato: '#ff6347',
  orange: '#ffa500',
  orangered: '#ff4500',
  yellow: '#ffff00',
  gold: '#ffd700',
  green: '#008000',
  seagreen: '#2e8b57',
  teal: '#008080',
  blue: '#0000ff',
  royalblue: '#4169e1',
  indigo: '#4b0082',
  purple: '#800080',
  violet: '#ee82ee',
  pink: '#ffc0cb',
  brown: '#a52a2a',
  gray: '#808080',
  grey: '#808080',
};

function normalizeCssColor(value: string): string {
  const trimmed = value.trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return trimmed;
  return CSS_COLOR_KEYWORDS[trimmed.toLowerCase()] ?? trimmed;
}

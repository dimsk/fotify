import { GOOGLE_EVENT_COLOR_HEX } from './google-event-colors';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

/** publicUrl is the admin-entered origin this app is reachable at (see GoogleOAuthConfigService). */
export function getRedirectUri(publicUrl: string): string {
  return `${publicUrl.replace(/\/$/, '')}/calendar/google/callback`;
}

export function buildGoogleAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_CALENDAR_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export interface GoogleTokens {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: Date;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function requestGoogleToken(
  clientId: string,
  clientSecret: string,
  body: Record<string, string>,
): Promise<GoogleTokens> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...body }),
  });
  if (!res.ok) {
    throw new Error(`Google token request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as GoogleTokenResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
  };
}

/** Exchanges the OAuth consent-screen redirect's `code` for tokens (initial connect). */
export function exchangeGoogleAuthCode(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  code: string,
): Promise<GoogleTokens> {
  return requestGoogleToken(clientId, clientSecret, { code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
}

/** Google typically doesn't re-issue a refresh_token here — callers keep the existing one. */
export function refreshGoogleAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<GoogleTokens> {
  return requestGoogleToken(clientId, clientSecret, { refresh_token: refreshToken, grant_type: 'refresh_token' });
}

export interface GoogleCalendarSummary {
  externalId: string;
  name: string;
  providerColor: string | null;
  /** The calendarList entry's own id when it's the account's primary calendar — used as the account email/label. */
  primaryEmail: string | null;
}

interface GoogleCalendarListEntry {
  id: string;
  summary: string;
  backgroundColor?: string;
  primary?: boolean;
}

export async function listGoogleCalendars(accessToken: string): Promise<GoogleCalendarSummary[]> {
  const res = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google calendarList request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { items: GoogleCalendarListEntry[] };
  return json.items.map((item) => ({
    externalId: item.id,
    name: item.summary,
    providerColor: item.backgroundColor ?? null,
    primaryEmail: item.primary ? item.id : null,
  }));
}

export interface GoogleEventParsed {
  externalId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
  importantColor: string | null;
  rawColorId: string | null;
  location: string | null;
}

interface GoogleEventRaw {
  id: string;
  summary?: string;
  colorId?: string;
  location?: string;
  start: { date?: string; dateTime?: string };
  end: { date?: string; dateTime?: string };
  status?: string;
}

/**
 * singleEvents=true is required so recurring events arrive expanded into
 * concrete instances rather than one master object carrying an RRULE this
 * code does not expand itself.
 */
export async function listGoogleEvents(
  accessToken: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date,
): Promise<GoogleEventParsed[]> {
  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const res = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    throw new Error(`Google events request failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { items: GoogleEventRaw[] };
  return json.items
    .filter((item) => item.status !== 'cancelled')
    .map((item) => ({
      externalId: item.id,
      title: item.summary || '(Ohne Titel)',
      startAt: new Date(item.start.dateTime ?? item.start.date!),
      endAt: new Date(item.end.dateTime ?? item.end.date!),
      isAllDay: Boolean(item.start.date),
      importantColor: item.colorId ? (GOOGLE_EVENT_COLOR_HEX[item.colorId] ?? null) : null,
      rawColorId: item.colorId ?? null,
      location: item.location?.trim() || null,
    }));
}

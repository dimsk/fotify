import type {
  BrowseSmbInput,
  CalendarAccount,
  CalendarSummary,
  CalendarTodayResponse,
  ConnectAppleAccountInput,
  CreateSourceInput,
  CurrentSlideResponse,
  DirectoryListing,
  GoogleOAuthConfigStatus,
  PhotoActionState,
  PhotoStats,
  RecentMedia,
  Settings,
  Source,
  Statistics,
  UpdateCalendarInput,
  UpdateGoogleOAuthConfigInput,
  UpdateSettingsInput,
  UpdateWeatherSettingsInput,
  WeatherForecast,
  WeatherLocationSuggestion,
  WeatherSettings,
} from './types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export const api = {
  sources: {
    list: () => request<Source[]>('/sources'),
    create: (input: CreateSourceInput) =>
      request<Source>('/sources', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    remove: (id: number) =>
      request<void>(`/sources/${id}`, { method: 'DELETE' }),
    rescan: (id: number) =>
      request<void>(`/sources/${id}/rescan`, { method: 'POST' }),
    backfillLocations: (id: number) =>
      request<void>(`/sources/${id}/backfill-locations`, { method: 'POST' }),
    backfillLensAperture: (id: number) =>
      request<void>(`/sources/${id}/backfill-lens-aperture`, {
        method: 'POST',
      }),
    pause: (id: number) =>
      request<void>(`/sources/${id}/pause`, { method: 'POST' }),
    resume: (id: number) =>
      request<void>(`/sources/${id}/resume`, { method: 'POST' }),
    browseLocal: (path?: string) =>
      request<DirectoryListing>('/sources/browse/local', {
        method: 'POST',
        body: JSON.stringify({ path }),
      }),
    browseSmb: (input: BrowseSmbInput) =>
      request<DirectoryListing>('/sources/browse/smb', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    scanProgressUrl: (id: number) => `/sources/${id}/scan-progress`,
    quickScanAll: () =>
      request<{ added: number; files: string[] }>('/sources/quick-scan-all', {
        method: 'POST',
      }),
  },
  photos: {
    currentSlide: () =>
      request<CurrentSlideResponse>('/photos/current-slide', {
        signal: timeoutSignal(10_000),
      }),
    slideshowHeartbeat: (clientId: string) =>
      request<void>('/photos/slideshow-heartbeat', {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      }),
    slideshowReady: (clientId: string, slideId: string) =>
      request<void>('/photos/slideshow-ready', {
        method: 'POST',
        body: JSON.stringify({ clientId, slideId }),
        signal: timeoutSignal(10_000),
      }),
    slideshowFailed: (clientId: string, slideId: string) =>
      request<void>('/photos/slideshow-failed', {
        method: 'POST',
        body: JSON.stringify({ clientId, slideId }),
        signal: timeoutSignal(10_000),
      }),
    slideshowDisconnect: (clientId: string) =>
      request<void>('/photos/slideshow-disconnect', {
        method: 'POST',
        body: JSON.stringify({ clientId }),
      }),
    stats: () => request<PhotoStats>('/photos/stats'),
    statistics: () => request<Statistics>('/photos/statistics'),
    recent: (limit?: number) =>
      request<RecentMedia[]>(`/photos/recent${limit ? `?limit=${limit}` : ''}`),
    backfillLocations: () =>
      request<void>('/photos/backfill-locations', { method: 'POST' }),
    backfillLensAperture: () =>
      request<void>('/photos/backfill-lens-aperture', { method: 'POST' }),
    actions: (id: number) => request<PhotoActionState>(`/photos/${id}/actions`),
    favorite: (id: number) =>
      request<PhotoActionState>(`/photos/${id}/favorite`, { method: 'POST' }),
    hide: (id: number) =>
      request<PhotoActionState>(`/photos/${id}/hide`, { method: 'POST' }),
    downloadUrl: (id: number) => `/photos/${id}/download`,
    displayUrl: (id: number) => `/photos/${id}/display`,
  },
  settings: {
    get: () => request<Settings>('/settings'),
    update: (input: UpdateSettingsInput) =>
      request<Settings>('/settings', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
  },
  weather: {
    locations: (query: string) =>
      request<WeatherLocationSuggestion[]>(
        `/weather/locations?q=${encodeURIComponent(query)}`,
      ),
    settings: () => request<WeatherSettings>('/weather/settings'),
    updateSettings: (input: UpdateWeatherSettingsInput) =>
      request<WeatherSettings>('/weather/settings', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    forecast: () => request<WeatherForecast>('/weather/forecast'),
  },
  calendar: {
    accounts: () => request<CalendarAccount[]>('/calendar/accounts'),
    calendars: (accountId: number) =>
      request<CalendarSummary[]>(`/calendar/accounts/${accountId}/calendars`),
    connectApple: (input: ConnectAppleAccountInput) =>
      request<CalendarAccount>('/calendar/accounts/apple', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    disconnect: (id: number) =>
      request<void>(`/calendar/accounts/${id}`, { method: 'DELETE' }),
    resync: (id: number) =>
      request<void>(`/calendar/accounts/${id}/resync`, { method: 'POST' }),
    updateCalendar: (id: number, input: UpdateCalendarInput) =>
      request<CalendarSummary>(`/calendar/calendars/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    today: () => request<CalendarTodayResponse>('/calendar/today'),
    googleConfig: () =>
      request<GoogleOAuthConfigStatus>('/calendar/google/config'),
    updateGoogleConfig: (input: UpdateGoogleOAuthConfigInput) =>
      request<GoogleOAuthConfigStatus>('/calendar/google/config', {
        method: 'PUT',
        body: JSON.stringify(input),
      }),
    // Opened via window.open (a real browser navigation through Google's
    // consent screen, in a new tab), never fetch() — see GoogleSetupGuideModal.tsx.
    googleConnectUrl: '/calendar/google/connect',
  },
};

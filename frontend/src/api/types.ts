export type SourceType = 'local' | 'smb';
export type SourceStatus = 'idle' | 'queued' | 'scanning' | 'error';

export interface Source {
  id: number;
  type: SourceType;
  name: string;
  localPath: string | null;
  smbHost: string | null;
  smbShare: string | null;
  smbUsername: string | null;
  smbDomain: string | null;
  smbRootPath: string | null;
  status: SourceStatus;
  lastScanError: string | null;
  paused: boolean;
  createdAt: string;
  photoCount: number;
  videoCount: number;
  photosNeedingLocationBackfill: number;
  locationBackfillActive: boolean;
  photosNeedingLensApertureBackfill: number;
  lensApertureBackfillActive: boolean;
  shownCount: number;
}

export interface CreateLocalSourceInput {
  type: 'local';
  name: string;
  localPath: string;
}

export interface CreateSmbSourceInput {
  type: 'smb';
  name: string;
  smbHost: string;
  smbShare: string;
  smbUsername: string;
  smbPassword: string;
  smbDomain?: string;
  smbRootPath?: string;
}

export type CreateSourceInput = CreateLocalSourceInput | CreateSmbSourceInput;

export interface DirectoryListing {
  currentPath: string;
  parentPath: string | null;
  directories: Array<{ name: string; path: string }>;
}

export interface BrowseSmbInput {
  host: string;
  share: string;
  username: string;
  password: string;
  domain?: string;
  path?: string;
}

export interface ScanProgressEvent {
  status:
    | 'scanning'
    | 'backfilling_locations'
    | 'backfilling_lens_aperture'
    | 'queued'
    | 'idle'
    | 'error';
  processed: number;
  total: number;
  currentFile?: string;
  error?: string;
  /** Set by the gateway so a shared socket can route events to the right source. */
  sourceId?: number;
}

export type TransitionEffect =
  | 'fade'
  | 'crossfadeBlur'
  | 'crossZoom'
  | 'dipToBlack'
  | 'dipToWhite'
  | 'filmGrain'
  | 'colorBreath'
  | 'lightLeak'
  | 'vignettePulse'
  | 'rackFocus'
  | 'exposureFlash'
  | 'radialBloom'
  | 'duotone'
  | 'staggerFade'
  | 'dustParticles'
  | 'random';
export type ShuffleMode = 'all' | 'source-rotation';
export type PlaybackMode = 'all' | 'images-only' | 'videos-only';
export type PhotoFrameStyle = 'none' | 'thin' | 'polaroid';
export type PhotoCaptionPosition = 'bottom-left' | 'bottom-right';
export type GrainEffect = 'none' | 'light' | 'strong' | 'extreme';
export type DateOverlayMode = 'always' | 'sometimes';
export type WeatherOverlayMode = 'always' | 'sometimes';
export type Language = 'en' | 'de';

export type AutoRescanFrequency = 'daily' | 'weekly';
export type VideoCompatibilityMode =
  | 'direct-mp4'
  | 'direct-common'
  | 'normalize';
export type VideoDurationMode =
  | 'full'
  | 'photo'
  | 'capped';
export type WeatherIcon =
  | 'sun'
  | 'moon'
  | 'cloud-sun'
  | 'cloud'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'storm';

export type CollageLayoutType =
  | 'heartCutout'
  | 'heartMosaic'
  | 'diamondGridDense'
  | 'diamondGridLarge'
  | 'diamondClusterTight'
  | 'diamondClusterScatter'
  | 'heroWithSupporting'
  | 'threeTopTwoBottom'
  | 'scrapbookScatter'
  | 'editorialMasonry';
export type CollageLayoutSelection = CollageLayoutType | 'random';

export interface Settings {
  id: number;
  language: Language;
  clientPresenceDetectionEnabled: boolean;
  slideshowZoom: number;
  transitionEffects: TransitionEffect[];
  transitionDurationMs: number;
  cinematicChance: number;
  imageDurationMs: number;
  playbackMode: PlaybackMode;
  videoCompatibilityMode: VideoCompatibilityMode;
  videoDurationMode: VideoDurationMode;
  videoMaxDurationMs: number;
  videoRandomSegmentEnabled: boolean;
  avoidRepeats: boolean;
  adjacentPortraitTriples: boolean;
  shuffleMode: ShuffleMode;
  photoFrameStyle: PhotoFrameStyle;
  photoCaptionPosition: PhotoCaptionPosition;
  grainEffect: GrainEffect;
  kenBurnsChance: number;
  nightModeEnabled: boolean;
  nightModeStart: string;
  nightModeEnd: string;
  scheduleTimezone: string;
  calendarOverlayEnabled: boolean;
  calendarOverlayStart: string;
  calendarOverlayEnd: string;
  calendarSyncIntervalMinutes: number;
  dateOverlayEnabled: boolean;
  dateOverlayMode: DateOverlayMode;
  weatherOverlayEnabled: boolean;
  weatherOverlayMode: WeatherOverlayMode;
  weatherForecastDays: number;
  weatherRefreshIntervalMinutes: number;
  weatherLocationId: number | null;
  weatherLocationName: string | null;
  weatherLocationAdmin1: string | null;
  weatherLocationCountry: string | null;
  weatherLatitude: number | null;
  weatherLongitude: number | null;
  weatherTimezone: string | null;
  autoRescanEnabled: boolean;
  autoRescanTime: string;
  autoRescanFrequency: AutoRescanFrequency;
  autoRescanWeekday: number;
  lastQuickScanAt: string | null;
  lastQuickScanAdded: number | null;
  lastQuickScanFiles: string | null;
  enabledImageFormats: string[];
  enabledVideoFormats: string[];
  collageEnabled: boolean;
  collageChance: number;
  collageTimeWindowMinutes: number;
  collageLayouts: CollageLayoutSelection[];
}

export interface UpdateSettingsInput {
  language?: Language;
  clientPresenceDetectionEnabled?: boolean;
  slideshowZoom?: number;
  transitionEffects?: TransitionEffect[];
  transitionDurationMs?: number;
  cinematicChance?: number;
  imageDurationMs?: number;
  playbackMode?: PlaybackMode;
  videoCompatibilityMode?: VideoCompatibilityMode;
  videoDurationMode?: VideoDurationMode;
  videoMaxDurationMs?: number;
  videoRandomSegmentEnabled?: boolean;
  avoidRepeats?: boolean;
  adjacentPortraitTriples?: boolean;
  shuffleMode?: ShuffleMode;
  photoFrameStyle?: PhotoFrameStyle;
  photoCaptionPosition?: PhotoCaptionPosition;
  grainEffect?: GrainEffect;
  kenBurnsChance?: number;
  nightModeEnabled?: boolean;
  nightModeStart?: string;
  nightModeEnd?: string;
  scheduleTimezone?: string;
  calendarOverlayEnabled?: boolean;
  calendarOverlayStart?: string;
  calendarOverlayEnd?: string;
  calendarSyncIntervalMinutes?: number;
  dateOverlayEnabled?: boolean;
  dateOverlayMode?: DateOverlayMode;
  autoRescanEnabled?: boolean;
  autoRescanTime?: string;
  autoRescanFrequency?: AutoRescanFrequency;
  autoRescanWeekday?: number;
  enabledImageFormats?: string[];
  enabledVideoFormats?: string[];
  collageEnabled?: boolean;
  collageChance?: number;
  collageTimeWindowMinutes?: number;
  collageLayouts?: CollageLayoutSelection[];
}

export interface WeatherLocationSuggestion {
  id: number;
  label: string;
  name: string;
  admin1: string | null;
  country: string | null;
  latitude: number;
  longitude: number;
  timezone: string | null;
}

export interface WeatherSettings {
  enabled: boolean;
  mode: WeatherOverlayMode;
  forecastDays: number;
  refreshIntervalMinutes: number;
  location: WeatherLocationSuggestion | null;
}

export interface UpdateWeatherSettingsInput {
  enabled: boolean;
  mode: WeatherOverlayMode;
  forecastDays: number;
  refreshIntervalMinutes: number;
  locationId?: number;
}

export interface WeatherForecast {
  visible: boolean;
  source: 'Open-Meteo';
  updatedAt: string | null;
  location: WeatherLocationSuggestion | null;
  current: {
    time: string;
    temperatureC: number;
    apparentTemperatureC: number;
    precipitationMm: number;
    weatherCode: number;
    condition: string;
    icon: WeatherIcon;
    windSpeedKmh: number;
    isDay: boolean;
  } | null;
  daily: Array<{
    date: string;
    weatherCode: number;
    condition: string;
    icon: WeatherIcon;
    temperatureMaxC: number;
    temperatureMinC: number;
    precipitationMm: number;
    precipitationProbability: number;
  }>;
}

export type CalendarProvider = 'google' | 'apple';
export type CalendarAccountStatus = 'idle' | 'syncing' | 'error';

export interface CalendarAccount {
  id: number;
  provider: CalendarProvider;
  label: string;
  status: CalendarAccountStatus;
  lastSyncError: string | null;
  lastSyncedAt: string | null;
  googleEmail: string | null;
  appleId: string | null;
  createdAt: string;
}

export interface CalendarSummary {
  id: number;
  accountId: number;
  externalId: string;
  name: string;
  providerColor: string | null;
  color: string;
  enabled: boolean;
}

export interface ConnectAppleAccountInput {
  label: string;
  appleId: string;
  appPassword: string;
}

export interface UpdateCalendarInput {
  enabled?: boolean;
  color?: string;
}

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

export interface GoogleOAuthConfigStatus {
  configured: boolean;
  clientId: string | null;
  publicUrl: string | null;
}

export interface UpdateGoogleOAuthConfigInput {
  clientId: string;
  publicUrl: string;
  clientSecret?: string;
}

export interface SlidePhoto {
  id: number;
  url: string;
  mediaType: 'image' | 'video';
  width: number;
  height: number;
  durationMs: number | null;
  mimeType: string | null;
  orientation: string;
  capturedAt: string | null;
  locationCity: string | null;
  locationCountry: string | null;
  lens: string | null;
  aperture: number | null;
}

export type SlideType = 'single' | 'triple' | 'collage' | 'empty';
export type ResolvedEffect =
  | 'fade'
  | 'crossfadeBlur'
  | 'crossZoom'
  | 'dipToBlack'
  | 'dipToWhite'
  | 'filmGrain'
  | 'colorBreath'
  | 'lightLeak'
  | 'vignettePulse'
  | 'rackFocus'
  | 'exposureFlash'
  | 'radialBloom'
  | 'duotone'
  | 'staggerFade'
  | 'dustParticles';

/**
 * The full server-decided state of the shared slideshow timeline. The
 * client never picks a photo or an effect itself — it polls this and
 * renders exactly what comes back, waiting nextPollInMs before asking
 * again. Every device polling this endpoint sees the same thing.
 */
export interface CurrentSlideResponse {
  slideId: string;
  type: SlideType;
  photos: SlidePhoto[];
  collageLayout: CollageLayoutType | null;
  effect: ResolvedEffect;
  lookCinematic: boolean;
  kenBurns: boolean;
  imageDurationMs: number;
  transitionDurationMs: number;
  nextPollInMs: number;
  elapsedMs: number;
  waitingForPlayback: boolean;
  videoStartOffsetMs: number;
  next: {
    type: SlideType;
    photos: SlidePhoto[];
    collageLayout: CollageLayoutType | null;
    videoStartOffsetMs: number;
  } | null;
}

export interface PhotoStats {
  total: number;
  portrait: number;
  landscape: number;
  square: number;
}

export interface RecentMedia {
  id: number;
  mediaType: 'image' | 'video';
  width: number;
  height: number;
  orientation: string;
  capturedAt: string | null;
  lastShownAt: string;
  relativePath: string;
  locationCity: string | null;
  locationCountry: string | null;
}

export interface PhotoActionState {
  photoId: number;
  favorited: boolean;
  hidden: boolean;
  downloadCount: number;
}

export interface SourceStatistic {
  id: number;
  name: string;
  type: SourceType;
  photoCount: number;
  videoCount: number;
  shownCount: number;
}

export interface Statistics {
  totalPhotos: number;
  totalVideos: number;
  totalSources: number;
  byOrientation: { portrait: number; landscape: number; square: number };
  shownCount: number;
  neverShownCount: number;
  photosWithGpsCoordinates: number;
  photosWithoutGpsCoordinates: number;
  cache: { fileCount: number; totalBytes: number };
  oldestCapturedAt: string | null;
  newestCapturedAt: string | null;
  photosNeedingLocationBackfill: number;
  photosNeedingLensApertureBackfill: number;
  sources: SourceStatistic[];
}

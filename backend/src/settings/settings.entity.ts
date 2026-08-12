import { Column, Entity, PrimaryColumn } from 'typeorm';

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
export type AutoRescanFrequency = 'daily' | 'weekly';
export type WeatherOverlayMode = 'always' | 'sometimes';
export type Language = 'en' | 'de';
export type VideoCompatibilityMode =
  | 'direct-mp4'
  | 'direct-common'
  | 'normalize';
export type VideoDurationMode =
  | 'full'
  | 'photo'
  | 'capped';

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

/** 'random' means "any of the 10 layout types may be chosen" — the same sentinel-vs-specific-choices pattern as TransitionEffect. */
export type CollageLayoutSelection = CollageLayoutType | 'random';

@Entity()
export class Settings {
  @PrimaryColumn({ type: 'int', default: 1 })
  id: number;

  /** UI language for admin/slideshow clients. English is the public default. */
  @Column({ type: 'text', default: 'en' })
  language: Language;

  /** If true, the shared slideshow timeline pauses when no client is connected. */
  @Column({ type: 'boolean', default: true })
  clientPresenceDetectionEnabled: boolean;

  /** Native browser-like zoom applied to the slideshow display. */
  @Column({ type: 'real', default: 1 })
  slideshowZoom: number;

  /**
   * The pool of effects the slideshow picks from. A single entry means
   * "always use this one effect"; multiple entries means "pick randomly
   * among these on every transition". `['random']` is a special case
   * meaning "pick from every available effect" — enforced to always be
   * the sole entry (never combined with specific effects) by the settings
   * UI and by pickEffect()'s handling.
   */
  @Column({ type: 'simple-array', default: 'fade' })
  transitionEffects: TransitionEffect[];

  @Column({ type: 'int', default: 1500 })
  transitionDurationMs: number;

  /**
   * Percent chance (0-100) that any given slide gets the cinematic color
   * grade applied as a persistent per-photo look (not a transition effect).
   * When it applies, the transition into that slide is forced to a plain
   * fade regardless of transitionEffects, so the grade reads cleanly.
   */
  @Column({ type: 'int', default: 60 })
  cinematicChance: number;

  /**
   * Percent chance (0-100) that a single landscape photo gets the Ken Burns
   * slow-zoom treatment as a persistent per-photo look (not a transition
   * effect — the transition stays whatever transitionEffects picked).
   * Portrait photos never get it: they render as triples, where a zoom on
   * one cell would fight the other two. Videos and collages never get it.
   */
  @Column({ type: 'int', default: 40 })
  kenBurnsChance: number;

  @Column({ type: 'int', default: 25000 })
  imageDurationMs: number;

  /**
   * Which media kinds the slideshow picks from:
   * 'all': photos and videos (default),
   * 'images-only': no videos are ever picked,
   * 'videos-only': no photos are ever picked (videos always render as
   * single slides; collages and portrait triples are skipped).
   */
  @Column({ type: 'text', default: 'all' })
  playbackMode: PlaybackMode;

  /** How discovered video files are prepared for browser playback. */
  @Column({ type: 'text', default: 'direct-common' })
  videoCompatibilityMode: VideoCompatibilityMode;

  /**
   * How long a single video slide stays on screen:
   * 'full': the whole clip; 'photo': the image display duration;
   * 'capped': at most videoMaxDurationMs. A clip shorter than the chosen
   * duration always ends the slide when it ends — never loops or holds its
   * last frame.
   */
  @Column({ type: 'text', default: 'photo' })
  videoDurationMode: VideoDurationMode;

  @Column({ type: 'int', default: 30000 })
  videoMaxDurationMs: number;

  /**
   * When true, a long video starts at a random offset and plays for the
   * image display duration as a "random segment" instead of from the
   * beginning. Independent of videoDurationMode: the segment length comes
   * from that mode (imageDurationMs for 'photo', videoMaxDurationMs for
   * 'capped', the clip length for 'full' — which leaves no room for an
   * offset, so the toggle only meaningfully combines with 'photo'/'capped').
   */
  @Column({ type: 'boolean', default: true })
  videoRandomSegmentEnabled: boolean;

  /** If true, never-shown photos are preferred over already-shown ones. */
  @Column({ type: 'boolean', default: true })
  avoidRepeats: boolean;

  /**
   * If true, a triple (3-portrait) slide picks its other two photos as the
   * nearest neighbors (by file path) of a random anchor photo, so the trio
   * shares a coherent context (e.g. the same burst/moment). If false, all
   * three are picked fully at random with no relation to each other.
   */
  @Column({ type: 'boolean', default: true })
  adjacentPortraitTriples: boolean;

  /**
   * 'all': pick randomly across every source.
   * 'source-rotation': stick to one randomly-chosen source for a while,
   * then switch to a different one (see rotationSourceId/rotationStartedAt).
   */
  @Column({ type: 'text', default: 'all' })
  shuffleMode: ShuffleMode;

  /**
   * Internal rotation bookkeeping for shuffleMode="source-rotation" — not
   * user-editable via the settings API, managed entirely by PhotosService.
   */
  @Column({ type: 'int', nullable: true })
  rotationSourceId: number | null;

  @Column({ type: 'datetime', nullable: true })
  rotationStartedAt: Date | null;

  /** Purely cosmetic border drawn around each displayed photo — a global display choice, not randomized per photo. */
  @Column({ type: 'text', default: 'none' })
  photoFrameStyle: PhotoFrameStyle;

  /** Position of the per-photo timestamp/location caption rendered by SlideshowEngine. */
  @Column({ type: 'text', default: 'bottom-right' })
  photoCaptionPosition: PhotoCaptionPosition;

  /** Persistent full-frame film grain overlay intensity — a global display choice, not a transition effect. */
  @Column({ type: 'text', default: 'strong' })
  grainEffect: GrainEffect;

  /**
   * If true, the slideshow shows a blank screen instead of picking photos
   * while the current local time falls within [nightModeStart, nightModeEnd)
   * (wrapping across midnight when start > end). The lookahead buffer isn't
   * touched — it resumes exactly where it left off once the window ends.
   */
  @Column({ type: 'boolean', default: true })
  nightModeEnabled: boolean;

  @Column({ type: 'text', default: '01:00' })
  nightModeStart: string;

  @Column({ type: 'text', default: '07:30' })
  nightModeEnd: string;

  /** Timezone used for slideshow schedules such as night mode and calendar overlay windows. */
  @Column({ type: 'text', default: 'Europe/Berlin' })
  scheduleTimezone: string;

  /**
   * If true, a "today's events" card is overlaid on the slideshow while the
   * current local time falls within [calendarOverlayStart, calendarOverlayEnd)
   * (wrapping past midnight when start > end) — same window semantics as
   * nightModeEnabled/Start/End, evaluated independently by the calendar module.
   */
  @Column({ type: 'boolean', default: false })
  calendarOverlayEnabled: boolean;

  @Column({ type: 'text', default: '07:00' })
  calendarOverlayStart: string;

  @Column({ type: 'text', default: '22:00' })
  calendarOverlayEnd: string;

  /** How often connected calendar accounts are resynced in the background. */
  @Column({ type: 'int', default: 15 })
  calendarSyncIntervalMinutes: number;

  /** If true, the current date/time is rendered in the slideshow's top-right corner. */
  @Column({ type: 'boolean', default: true })
  dateOverlayEnabled: boolean;

  /**
   * 'always': date/time stays visible.
   * 'sometimes': date/time fades in only for a random subset of displayed slides.
   */
  @Column({ type: 'text', default: 'always' })
  dateOverlayMode: DateOverlayMode;

  /** If true, the slideshow can show the configured location's weather overlay. */
  @Column({ type: 'boolean', default: true })
  weatherOverlayEnabled: boolean;

  /**
   * 'always': weather stays visible.
   * 'sometimes': weather fades in only for a random subset of displayed slides.
   */
  @Column({ type: 'text', default: 'always' })
  weatherOverlayMode: WeatherOverlayMode;

  /** Number of daily forecast entries shown in the overlay. */
  @Column({ type: 'int', default: 4 })
  weatherForecastDays: number;

  /** How often the cached forecast is refreshed from Open-Meteo, in minutes. */
  @Column({ type: 'int', default: 15 })
  weatherRefreshIntervalMinutes: number;

  /** Open-Meteo geocoding id; set only by WeatherService after validating a suggested place. */
  @Column({ type: 'int', nullable: true })
  weatherLocationId: number | null;

  @Column({ type: 'text', nullable: true })
  weatherLocationName: string | null;

  @Column({ type: 'text', nullable: true })
  weatherLocationAdmin1: string | null;

  @Column({ type: 'text', nullable: true })
  weatherLocationCountry: string | null;

  @Column({ type: 'real', nullable: true })
  weatherLatitude: number | null;

  @Column({ type: 'real', nullable: true })
  weatherLongitude: number | null;

  @Column({ type: 'text', nullable: true })
  weatherTimezone: string | null;

  /** If true, every non-paused source is quick-scanned automatically once a day at autoRescanTime. */
  @Column({ type: 'boolean', default: false })
  autoRescanEnabled: boolean;

  /**
   * Local time ("HH:mm", in scheduleTimezone) at which the automatic daily
   * quick scan runs. The quick scan only adds files whose path is not yet
   * in the database — no hash or timestamp comparison, so it stays cheap
   * even for large libraries.
   */
  @Column({ type: 'text', default: '04:00' })
  autoRescanTime: string;

  /** 'daily': scan every day; 'weekly': scan only on autoRescanWeekday. */
  @Column({ type: 'text', default: 'daily' })
  autoRescanFrequency: AutoRescanFrequency;

  /** ISO weekday (1 = Monday … 7 = Sunday) used when frequency is 'weekly'. */
  @Column({ type: 'int', default: 1 })
  autoRescanWeekday: number;

  /** When the most recent quick scan (scheduled or manual) finished. */
  @Column({ type: 'datetime', nullable: true })
  lastQuickScanAt: Date | null;

  /** How many previously-unknown files the most recent quick scan added. */
  @Column({ type: 'int', nullable: true })
  lastQuickScanAdded: number | null;

  /** Paths of the files the most recent quick scan added, JSON-encoded
   * (only the newest scan's list is kept).
   */
  @Column({ type: 'text', nullable: true })
  lastQuickScanFiles: string | null;

  /**
   * Which file extensions the scanner picks up, lower-case with leading dot
   * (e.g. '.jpg'). Both lists act as a whitelist within the formats Fotify
   * supports at all — removing an entry hides matching files from future
   * scans without deleting already-imported rows.
   */
  @Column({ type: 'simple-array', default: '.jpg,.jpeg,.png,.heic,.heif' })
  enabledImageFormats: string[];

  @Column({ type: 'simple-array', default: '.mp4,.mov,.m4v,.webm,.mkv,.avi' })
  enabledVideoFormats: string[];

  /**
   * If true, some slides are assembled from several photos taken close
   * together in time (e.g. an afternoon during a trip) instead of a single
   * photo or portrait triple — see collageChance/collageTimeWindowMinutes/
   * collageMin/MaxPhotos and SlideshowStateService.randomTemporalCluster().
   */
  @Column({ type: 'boolean', default: true })
  collageEnabled: boolean;

  /** Percent chance (0-100) that any given slide attempts a collage instead of the usual single/triple pick. */
  @Column({ type: 'int', default: 10 })
  collageChance: number;

  /**
   * How close together (in minutes, in either direction of a random anchor
   * photo) two photos' capturedAt timestamps need to be to belong to the
   * same collage. A single rolling window rather than separate "minutes"
   * vs. "same calendar day" modes — 1440 covers "same day" while also
   * handling the midnight-boundary case correctly (23:55 and 00:05 the
   * next day are close in time but different calendar days).
   */
  @Column({ type: 'int', default: 1800 })
  collageTimeWindowMinutes: number;

  /**
   * The pool of collage layout types eligible to be chosen (see
   * CollageLayoutType) — same MultiSelect + 'random'-is-exclusive UI
   * pattern as transitionEffects. Each layout has a fixed required photo
   * count (see COLLAGE_LAYOUT_PHOTO_COUNTS), so there's no separate
   * min/max photos setting anymore.
   */
  @Column({ type: 'simple-array', default: 'random' })
  collageLayouts: CollageLayoutSelection[];
}

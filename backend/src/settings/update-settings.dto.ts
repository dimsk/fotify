import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  AutoRescanFrequency,
  CollageLayoutSelection,
  DateOverlayMode,
  GrainEffect,
  Language,
  PhotoCaptionPosition,
  PhotoFrameStyle,
  ShuffleMode,
  TransitionEffect,
  VideoCompatibilityMode,
  VideoDurationMode,
} from './settings.entity';

const TIME_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const EFFECTS: TransitionEffect[] = [
  'fade',
  'crossfadeBlur',
  'crossZoom',
  'dipToBlack',
  'dipToWhite',
  'filmGrain',
  'colorBreath',
  'lightLeak',
  'vignettePulse',
  'rackFocus',
  'exposureFlash',
  'radialBloom',
  'duotone',
  'staggerFade',
  'dustParticles',
  'random',
];
const SHUFFLE_MODES: ShuffleMode[] = ['all', 'source-rotation'];
const FRAME_STYLES: PhotoFrameStyle[] = ['none', 'thin', 'polaroid'];
const CAPTION_POSITIONS: PhotoCaptionPosition[] = [
  'bottom-left',
  'bottom-right',
];
const GRAIN_EFFECTS: GrainEffect[] = ['none', 'light', 'strong', 'extreme'];
const DATE_OVERLAY_MODES: DateOverlayMode[] = ['always', 'sometimes'];
const AUTO_RESCAN_FREQUENCIES: AutoRescanFrequency[] = ['daily', 'weekly'];
/** Every file format Fotify can import — the settings pick a subset. */
export const SUPPORTED_IMAGE_FORMATS = ['.jpg', '.jpeg', '.png', '.heic', '.heif'];
export const SUPPORTED_VIDEO_FORMATS = [
  '.mp4',
  '.mov',
  '.m4v',
  '.webm',
  '.mkv',
  '.avi',
];
const LANGUAGES: Language[] = ['en', 'de'];
const VIDEO_COMPATIBILITY_MODES: VideoCompatibilityMode[] = [
  'direct-mp4',
  'direct-common',
  'normalize',
];
const VIDEO_DURATION_MODES: VideoDurationMode[] = [
  'full',
  'photo',
  'capped',
  'random-segment',
];
const COLLAGE_LAYOUTS: CollageLayoutSelection[] = [
  'heartCutout',
  'heartMosaic',
  'diamondGridDense',
  'diamondGridLarge',
  'diamondClusterTight',
  'diamondClusterScatter',
  'heroWithSupporting',
  'threeTopTwoBottom',
  'scrapbookScatter',
  'editorialMasonry',
  'random',
];

export class UpdateSettingsDto {
  @IsOptional()
  @IsIn(LANGUAGES)
  language?: Language;

  @IsOptional()
  @IsBoolean()
  clientPresenceDetectionEnabled?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(2)
  slideshowZoom?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(EFFECTS, { each: true })
  transitionEffects?: TransitionEffect[];

  @IsOptional()
  @IsInt()
  @Min(100)
  transitionDurationMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  cinematicChance?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  kenBurnsChance?: number;

  @IsOptional()
  @IsInt()
  @Min(500)
  imageDurationMs?: number;

  @IsOptional()
  @IsIn(VIDEO_COMPATIBILITY_MODES)
  videoCompatibilityMode?: VideoCompatibilityMode;

  @IsOptional()
  @IsIn(VIDEO_DURATION_MODES)
  videoDurationMode?: VideoDurationMode;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(600000)
  videoMaxDurationMs?: number;

  @IsOptional()
  @IsBoolean()
  avoidRepeats?: boolean;

  @IsOptional()
  @IsBoolean()
  adjacentPortraitTriples?: boolean;

  @IsOptional()
  @IsIn(SHUFFLE_MODES)
  shuffleMode?: ShuffleMode;

  @IsOptional()
  @IsIn(FRAME_STYLES)
  photoFrameStyle?: PhotoFrameStyle;

  @IsOptional()
  @IsIn(CAPTION_POSITIONS)
  photoCaptionPosition?: PhotoCaptionPosition;

  @IsOptional()
  @IsIn(GRAIN_EFFECTS)
  grainEffect?: GrainEffect;

  @IsOptional()
  @IsBoolean()
  nightModeEnabled?: boolean;

  @IsOptional()
  @Matches(TIME_HHMM)
  nightModeStart?: string;

  @IsOptional()
  @Matches(TIME_HHMM)
  nightModeEnd?: string;

  @IsOptional()
  @IsString()
  scheduleTimezone?: string;

  @IsOptional()
  @IsBoolean()
  calendarOverlayEnabled?: boolean;

  @IsOptional()
  @Matches(TIME_HHMM)
  calendarOverlayStart?: string;

  @IsOptional()
  @Matches(TIME_HHMM)
  calendarOverlayEnd?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  calendarSyncIntervalMinutes?: number;

  @IsOptional()
  @IsBoolean()
  dateOverlayEnabled?: boolean;

  @IsOptional()
  @IsIn(DATE_OVERLAY_MODES)
  dateOverlayMode?: DateOverlayMode;

  @IsOptional()
  @IsBoolean()
  autoRescanEnabled?: boolean;

  @IsOptional()
  @Matches(TIME_HHMM)
  autoRescanTime?: string;

  @IsOptional()
  @IsIn(AUTO_RESCAN_FREQUENCIES)
  autoRescanFrequency?: AutoRescanFrequency;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  autoRescanWeekday?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(SUPPORTED_IMAGE_FORMATS, { each: true })
  enabledImageFormats?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(SUPPORTED_VIDEO_FORMATS, { each: true })
  enabledVideoFormats?: string[];

  @IsOptional()
  @IsBoolean()
  collageEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  collageChance?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  collageTimeWindowMinutes?: number;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(COLLAGE_LAYOUTS, { each: true })
  collageLayouts?: CollageLayoutSelection[];
}

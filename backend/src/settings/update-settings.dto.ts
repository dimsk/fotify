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
  CollageLayoutSelection,
  DateOverlayMode,
  GrainEffect,
  Language,
  PhotoCaptionPosition,
  PhotoFrameStyle,
  ShuffleMode,
  TransitionEffect,
} from './settings.entity';

const TIME_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

const EFFECTS: TransitionEffect[] = [
  'fade',
  'zoom',
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
const GRAIN_EFFECTS: GrainEffect[] = ['none', 'light', 'strong'];
const DATE_OVERLAY_MODES: DateOverlayMode[] = ['always', 'sometimes'];
const LANGUAGES: Language[] = ['en', 'de'];
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
  @Min(500)
  imageDurationMs?: number;

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

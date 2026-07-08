import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ImageOff } from 'lucide-react';
import { api } from '../api/client';
import { useSlideshowEngine } from '../slideshow/useSlideshowEngine';
import { useAutoFullscreen } from '../hooks/useAutoFullscreen';
import { useViewportScale } from '../hooks/useViewportScale';
import { useFixedViewportWidth } from '../hooks/useFixedViewportWidth';
import { MAX_SLIDE_CELLS } from '../slideshow/SlideLayer';
import { CalendarOverlay } from '../slideshow/CalendarOverlay';
import { DateOverlay } from '../slideshow/DateOverlay';
import { WeatherOverlay } from '../slideshow/WeatherOverlay';
import { PhotoActionQr } from '../slideshow/PhotoActionQr';
import type {
  DateOverlayMode,
  GrainEffect,
  PhotoCaptionPosition,
  PhotoFrameStyle,
  WeatherOverlayMode,
} from '../api/types';
import styles from './SlideshowPage.module.css';

const FRAME_CLASS: Record<PhotoFrameStyle, string | undefined> = {
  none: undefined,
  thin: styles.frameThin,
  polaroid: styles.framePolaroid,
};

const GRAIN_CLASS: Record<GrainEffect, string | undefined> = {
  none: undefined,
  light: styles.grainLight,
  strong: styles.grainStrong,
};

const CAPTION_POSITION_CLASS: Record<PhotoCaptionPosition, string> = {
  'bottom-left': styles.captionBottomLeft,
  'bottom-right': styles.captionBottomRight,
};

// These are global display choices (set once via Settings), not per-photo
// random picks — refetched occasionally so admin changes are picked up
// without requiring a manual reload of the kiosk display.
const DISPLAY_SETTINGS_REFRESH_MS = 60_000;
// Makes the slideshow render as if the browser were zoomed to 90%, matching
// the look requested for the kiosk display, without a CSS-transform hack.
const SLIDESHOW_VIEWPORT_SCALE = 0.9;
const TIMED_OVERLAY_CHANCE = 0.35;
const TIMED_OVERLAY_MAX_VISIBLE_MS = 9000;
const TIMED_OVERLAY_MIN_VISIBLE_MS = 3500;

interface SlideShownDetail {
  imageDurationMs: number;
}

function renderCells() {
  return Array.from({ length: MAX_SLIDE_CELLS }, (_, i) => (
    <div key={i} className={styles.cell}>
      <img alt="" />
      <span className={styles.caption} data-caption />
    </div>
  ));
}

export function SlideshowPage() {
  const layerARef = useRef<HTMLDivElement>(null);
  const layerBRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [hasPhotos, setHasPhotos] = useState<boolean | null>(null);
  const [frameStyle, setFrameStyle] = useState<PhotoFrameStyle>('none');
  const [captionPosition, setCaptionPosition] =
    useState<PhotoCaptionPosition>('bottom-right');
  const [grainEffect, setGrainEffect] = useState<GrainEffect>('none');
  const [dateOverlayEnabled, setDateOverlayEnabled] = useState(false);
  const [dateOverlayMode, setDateOverlayMode] =
    useState<DateOverlayMode>('always');
  const [weatherOverlayEnabled, setWeatherOverlayEnabled] = useState(false);
  const [weatherOverlayMode, setWeatherOverlayMode] =
    useState<WeatherOverlayMode>('always');
  const [timedOverlayVisible, setTimedOverlayVisible] = useState(false);

  useEffect(() => {
    api.photos
      .stats()
      .then((stats) => setHasPhotos(stats.total > 0))
      .catch(() => setHasPhotos(false));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      api.settings
        .get()
        .then((settings) => {
          if (!cancelled) {
            setFrameStyle(settings.photoFrameStyle);
            setCaptionPosition(settings.photoCaptionPosition);
            setGrainEffect(settings.grainEffect);
            setDateOverlayEnabled(settings.dateOverlayEnabled);
            setDateOverlayMode(settings.dateOverlayMode);
            setWeatherOverlayEnabled(settings.weatherOverlayEnabled);
            setWeatherOverlayMode(settings.weatherOverlayMode);
          }
        })
        .catch(() => undefined);
    };
    refresh();
    const interval = setInterval(refresh, DISPLAY_SETTINGS_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const timedOverlayActive =
      (dateOverlayEnabled && dateOverlayMode === 'sometimes') ||
      (weatherOverlayEnabled && weatherOverlayMode === 'sometimes');
    setTimedOverlayVisible(false);
    if (!timedOverlayActive) return;

    let timeout: ReturnType<typeof setTimeout> | null = null;
    const onSlideShown = (event: Event) => {
      if (timeout) clearTimeout(timeout);
      const detail = (event as CustomEvent<SlideShownDetail>).detail;
      const shouldShow = Math.random() < TIMED_OVERLAY_CHANCE;
      setTimedOverlayVisible(shouldShow);
      if (!shouldShow) return;

      const visibleMs = Math.max(
        TIMED_OVERLAY_MIN_VISIBLE_MS,
        Math.min(TIMED_OVERLAY_MAX_VISIBLE_MS, detail.imageDurationMs - 900),
      );
      timeout = setTimeout(() => setTimedOverlayVisible(false), visibleMs);
    };

    window.addEventListener('fotify:slide-shown', onSlideShown);
    return () => {
      window.removeEventListener('fotify:slide-shown', onSlideShown);
      if (timeout) clearTimeout(timeout);
    };
  }, [
    dateOverlayEnabled,
    dateOverlayMode,
    weatherOverlayEnabled,
    weatherOverlayMode,
  ]);

  useSlideshowEngine(layerARef, layerBRef, overlayRef);
  useAutoFullscreen();
  useFixedViewportWidth();
  useViewportScale(SLIDESHOW_VIEWPORT_SCALE);

  if (hasPhotos === false) {
    return (
      <div className={styles.emptyState}>
        <ImageOff size={48} strokeWidth={1.5} />
        <p>
          Keine Fotos konfiguriert. Bitte im{' '}
          <Link to="/admin">Admin-Bereich</Link> Verzeichnisse hinzufügen.
        </p>
      </div>
    );
  }

  const rootClassName = [
    styles.root,
    FRAME_CLASS[frameStyle],
    CAPTION_POSITION_CLASS[captionPosition],
  ]
    .filter(Boolean)
    .join(' ');
  const grainClassName = GRAIN_CLASS[grainEffect];

  return (
    <div className={rootClassName}>
      {/* Smooth heart silhouette used by the heartCutout/heartMosaic collage
          layouts, defined once here (objectBoundingBox so it scales to
          whatever box it's applied to) rather than a hand-drawn polygon. */}
      <svg
        width="0"
        height="0"
        style={{ position: 'absolute' }}
        aria-hidden="true"
      >
        <defs>
          <clipPath id="fotify-heart-clip" clipPathUnits="objectBoundingBox">
            <path d="M0.5,1 C0.5,1 0.05,0.65 0.05,0.35 C0.05,0.15 0.2,0 0.35,0 C0.45,0 0.5,0.05 0.5,0.15 C0.5,0.05 0.55,0 0.65,0 C0.8,0 0.95,0.15 0.95,0.35 C0.95,0.65 0.5,1 0.5,1 Z" />
          </clipPath>
        </defs>
      </svg>
      <div ref={layerARef} className={styles.layer}>
        {renderCells()}
      </div>
      <div ref={layerBRef} className={styles.layer}>
        {renderCells()}
      </div>
      {grainClassName && (
        <div
          className={`${styles.globalGrain} ${grainClassName}`}
          aria-hidden="true"
        />
      )}
      <div ref={overlayRef} className={styles.overlay}>
        <div className={`${styles.fx} ${styles.fxWash}`} data-fx="wash" />
        <div className={`${styles.fx} ${styles.fxGrain}`} data-fx="grain" />
        <div className={`${styles.fx} ${styles.fxBloom}`} data-fx="bloom" />
        <div
          className={`${styles.fx} ${styles.fxVignette}`}
          data-fx="vignette"
        />
        <div
          className={`${styles.fx} ${styles.fxParticles}`}
          data-fx="particles"
        />
      </div>
      <CalendarOverlay />
      <DateOverlay
        enabled={dateOverlayEnabled}
        mode={dateOverlayMode}
        timedVisible={timedOverlayVisible}
        companionVisible={
          weatherOverlayEnabled &&
          weatherOverlayMode === 'sometimes' &&
          timedOverlayVisible
        }
      />
      <WeatherOverlay
        enabled={weatherOverlayEnabled}
        mode={weatherOverlayMode}
        timedVisible={timedOverlayVisible}
      />
      <PhotoActionQr />
    </div>
  );
}

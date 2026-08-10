import { api } from '../api/client';
import type {
  CollageLayoutType,
  CurrentSlideResponse,
  SlidePhoto,
  SlideType,
} from '../api/types';
import { preloadAll } from './preload';
import type { SlideLayerHandle } from './SlideLayer';
import type { EffectOverlayHandle } from './EffectOverlay';
import {
  applyCinematicLook,
  runTransition,
  startKenBurns,
  stopKenBurns,
} from './effects';
import { formatCaption } from './format-date';
import { COLLAGE_TEMPLATES } from './collage-templates';

const FIRST_SLIDE_PRELOAD_TIMEOUT_MS = 4000;
const MIN_TRANSITION_PRELOAD_MS = 1000;
const RETRY_AFTER_ERROR_MS = 2000;
const CLIENT_HEARTBEAT_INTERVAL_MS = 15_000;
const VIDEO_READY_TIMEOUT_MS = 120_000;

function createClientId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

interface Renderable {
  type: SlideType;
  photos: SlidePhoto[];
  collageLayout: CollageLayoutType | null;
}

/**
 * A single/triple slide always has exactly 1 or 3 photos, so the cell
 * count alone already determines the right shape — no need to branch on
 * `type` too.
 */
function gridShapeFor(count: number): { columns: string; rows: string } {
  if (count <= 1) return { columns: '1fr', rows: '1fr' };
  if (count === 2) return { columns: '1fr 1fr', rows: '1fr' };
  if (count === 3) return { columns: '1fr 1fr 1fr', rows: '1fr' };
  return { columns: '1fr 1fr 1fr', rows: '1fr 1fr' };
}

/**
 * Clears every absolute-position/rotation/mask style a named collage layout
 * may have set on this cell, so it never leaks into a later grid-based
 * (single/triple/other-collage) render — the DOM cell pool is reused, never
 * re-mounted, so every render path must fully own every style it touches.
 */
function resetCollageStyles(cell: HTMLElement): void {
  cell.style.position = '';
  cell.style.left = '';
  cell.style.top = '';
  cell.style.width = '';
  cell.style.height = '';
  cell.style.transform = '';
  cell.style.clipPath = '';
  cell.style.filter = '';
  cell.style.borderRadius = '';
  cell.style.zIndex = '';
}

// A thin inset shrinks every cell slightly so neighboring (or tessellated)
// photos never butt directly against each other — reads as deliberate
// spacing instead of images sticking together.
const CELL_GAP_PERCENT = 1.2;

// One soft, consistent shadow for every collage cell (drop-shadow, not
// box-shadow, since it also has to work on rotated/clip-path-masked
// cells) — no colored/white borders, just depth. Deliberately heavy so it
// reads clearly against both light and dark photos, not just a faint haze.
const COLLAGE_SHADOW =
  'drop-shadow(0 16px 22px rgba(0, 0, 0, 0.85)) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.7))';

const ENTRANCE_DURATION_MS = 700;
const ENTRANCE_STAGGER_MS = 150;
const ENTRANCE_EASE = 'ease-out';

/** A Fisher-Yates shuffle of [0..count-1] — the reveal order for a collage's cells. */
function shuffledOrder(count: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/** A slow, staggered fade-in for one cell, at its position in the (randomized) reveal order. */
function animateCollageEntrance(cell: HTMLElement, position: number): void {
  const anim = cell.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: ENTRANCE_DURATION_MS,
    delay: position * ENTRANCE_STAGGER_MS,
    easing: ENTRANCE_EASE,
    // Without this, the animation has no visual effect until its delay
    // elapses — every later cell would sit fully opaque from frame 0, then
    // jump to hidden the instant its delay ends (a flash), instead of
    // staying hidden through the delay and fading in cleanly.
    fill: 'both',
  });
  anim.finished
    .then(() => {
      cell.style.opacity = '';
      anim.cancel();
    })
    .catch(() => undefined);
}

function prepareCollageCellsForReveal(
  layer: SlideLayerHandle,
  layoutType: CollageLayoutType,
): void {
  const template = COLLAGE_TEMPLATES[layoutType];
  layer.images.forEach((img, index) => {
    const cell = img.parentElement as HTMLElement | null;
    if (!cell || !template.cells[index] || cell.style.display === 'none')
      return;
    for (const anim of cell.getAnimations()) anim.cancel();
    cell.style.opacity = '0';
  });
}

/**
 * Kicks off the per-cell fade-in for a collage, in random order, one after
 * another until all are shown. Must be called only once the layer is
 * actually visible (opacity 1) — triggering it earlier (e.g. right after
 * setting img.src, while the layer is still being preloaded behind the
 * scenes) means the whole fade-in runs and finishes invisibly before the
 * viewer ever sees it.
 */
function revealCollageCells(
  layer: SlideLayerHandle,
  layoutType: CollageLayoutType,
): void {
  const template = COLLAGE_TEMPLATES[layoutType];
  const cells: HTMLElement[] = [];
  layer.images.forEach((img, index) => {
    const cell = img.parentElement as HTMLElement | null;
    if (cell && template.cells[index]) cells.push(cell);
  });
  const order = shuffledOrder(cells.length);
  cells.forEach((cell, i) => animateCollageEntrance(cell, order[i]));
}

function clearVideo(video: HTMLVideoElement): void {
  video.pause();
  video.removeAttribute('src');
  video.load();
  video.style.display = 'none';
  video.loop = false;
}

function setCellMedia(
  layer: SlideLayerHandle,
  index: number,
  photo: SlidePhoto | undefined,
): void {
  const image = layer.images[index];
  const video = layer.videos[index];
  if (!photo) {
    image.removeAttribute('src');
    image.style.display = 'none';
    clearVideo(video);
    return;
  }
  if (photo.mediaType === 'video') {
    image.removeAttribute('src');
    image.style.display = 'none';
    video.style.display = 'block';
    video.muted = true;
    video.playsInline = true;
    if (video.getAttribute('src') !== photo.url) {
      video.src = photo.url;
      video.load();
    }
    return;
  }
  clearVideo(video);
  image.style.display = 'block';
  if (image.getAttribute('src') !== photo.url) image.src = photo.url;
}

/** Renders single/triple/empty slides via the existing uniform CSS Grid. */
function applyGridLayout(layer: SlideLayerHandle, state: Renderable): void {
  layer.container.style.clipPath = '';
  layer.container.style.display = 'grid';
  const shape = gridShapeFor(state.photos.length);
  layer.container.style.gridTemplateColumns = shape.columns;
  layer.container.style.gridTemplateRows = shape.rows;
  layer.cells.forEach((cell, index) => {
    const img = layer.images[index];
    const video = layer.videos[index];
    const caption = layer.captions[index] as HTMLElement | undefined;
    const photo = state.photos[index];
    resetCollageStyles(cell);
    if (!photo) {
      cell.style.display = 'none';
      setCellMedia(layer, index, undefined);
      if (caption) caption.textContent = '';
      return;
    }
    cell.style.display = 'block';
    img.style.objectFit =
      state.type === 'single' && photo.orientation === 'portrait'
        ? 'contain'
        : 'cover';
    // 'cover' on a widescreen (16:9) crops landscape photos top+bottom by
    // default. For narrower aspects (4:3, 3:2) we want that crop centered
    // explicitly — equal amounts cut from top and bottom — rather than any
    // default anchor bias, so the subject stays in frame. object-position
    // does exactly that without touching layout.
    if (
      state.type === 'single' &&
      photo.orientation === 'landscape' &&
      img.style.objectFit === 'cover'
    ) {
      img.style.objectPosition = '50% 50%';
    } else {
      img.style.objectPosition = '';
    }
    video.style.objectFit = img.style.objectFit;
    video.style.objectPosition = img.style.objectPosition;
    setCellMedia(layer, index, photo);
    if (caption) caption.textContent = formatCaption(photo);
  });
}

/** Renders one of the 10 named collage layouts as absolutely-positioned, possibly rotated/masked cells. */
function applyCollageLayout(
  layer: SlideLayerHandle,
  layoutType: CollageLayoutType,
  photos: SlidePhoto[],
): void {
  const template = COLLAGE_TEMPLATES[layoutType];
  layer.container.style.display = 'block';
  layer.container.style.gridTemplateColumns = '';
  layer.container.style.gridTemplateRows = '';
  layer.container.style.clipPath = template.groupClipPath ?? '';

  layer.cells.forEach((cell, index) => {
    const img = layer.images[index];
    const caption = layer.captions[index] as HTMLElement | undefined;
    const spec = template.cells[index];
    const photo = photos[index];

    if (!spec || !photo) {
      cell.style.display = 'none';
      resetCollageStyles(cell);
      setCellMedia(layer, index, undefined);
      if (caption) caption.textContent = '';
      return;
    }

    cell.style.display = 'block';
    cell.style.position = 'absolute';
    cell.style.left = `${spec.left + CELL_GAP_PERCENT}%`;
    cell.style.top = `${spec.top + CELL_GAP_PERCENT}%`;
    cell.style.width = `${spec.width - CELL_GAP_PERCENT * 2}%`;
    cell.style.height = `${spec.height - CELL_GAP_PERCENT * 2}%`;
    cell.style.transform = spec.rotate ? `rotate(${spec.rotate}deg)` : '';
    cell.style.clipPath = spec.clipPath ?? '';
    cell.style.filter = COLLAGE_SHADOW;
    cell.style.borderRadius = spec.radius ? `${spec.radius}%` : '';
    cell.style.zIndex = spec.z !== undefined ? String(spec.z) : '';

    img.style.objectFit = 'cover';
    setCellMedia(layer, index, photo);
    if (caption)
      caption.textContent = template.showCaptions
        ? formatCaption(photo, false)
        : '';
  });
}

function applyStateToLayer(layer: SlideLayerHandle, state: Renderable): void {
  if (
    state.type === 'collage' &&
    state.collageLayout &&
    state.photos.every((photo) => photo.mediaType === 'image')
  ) {
    applyCollageLayout(layer, state.collageLayout, state.photos);
    return;
  }
  applyGridLayout(
    layer,
    state.type === 'collage'
      ? { ...state, type: 'single', photos: state.photos.slice(0, 1) }
      : state,
  );
}

function videosForState(layer: SlideLayerHandle, state: CurrentSlideResponse) {
  return state.photos
    .map((photo, index) => ({ photo, video: layer.videos[index] }))
    .filter(({ photo }) => photo.mediaType === 'video');
}

async function prepareLayerVideos(
  layer: SlideLayerHandle,
  state: CurrentSlideResponse,
  responseReceivedAt: number,
  isCancelled: () => boolean,
): Promise<boolean> {
  const videos = videosForState(layer, state);
  try {
    await Promise.all(videos.map(({ video }) => waitForVideoMetadata(video)));
    await Promise.all(
      videos.map(async ({ photo, video }) => {
        if (isCancelled()) throw new Error('Slideshow stopped');
        const durationMs = photo.durationMs ?? state.imageDurationMs;
        video.loop = state.imageDurationMs > durationMs;
        const elapsedMs =
          state.waitingForPlayback
            ? 0
            : state.elapsedMs + (performance.now() - responseReceivedAt);
        const absoluteOffsetMs = state.videoStartOffsetMs + elapsedMs;
        const offsetMs = video.loop
          ? absoluteOffsetMs % durationMs
          : Math.min(absoluteOffsetMs, Math.max(0, durationMs - 100));
        await seekVideo(video, offsetMs / 1000);
        await waitForVideoData(video);

        if (!state.waitingForPlayback) {
          const refreshedElapsedMs =
            state.elapsedMs + (performance.now() - responseReceivedAt);
          if (refreshedElapsedMs >= state.imageDurationMs) {
            throw new Error('Video slide expired while loading');
          }
          const refreshedAbsoluteOffsetMs =
            state.videoStartOffsetMs + refreshedElapsedMs;
          const refreshedOffsetMs = video.loop
            ? refreshedAbsoluteOffsetMs % durationMs
            : Math.min(
                refreshedAbsoluteOffsetMs,
                Math.max(0, durationMs - 100),
              );
          await seekVideo(video, refreshedOffsetMs / 1000);
        }

        // Prove muted autoplay and fetch enough data before transitioning.
        // The video is reset to the chosen frame and remains paused until it
        // is fully visible, so loading time does not consume display time.
        if (state.waitingForPlayback) {
          await withTimeout(video.play(), VIDEO_READY_TIMEOUT_MS);
          video.pause();
          await seekVideo(video, offsetMs / 1000);
        }
        if (isCancelled()) {
          video.pause();
          throw new Error('Slideshow stopped');
        }
      }),
    );
    return true;
  } catch {
    for (const { video } of videos) clearVideo(video);
    return false;
  }
}

async function playLayerVideos(
  layer: SlideLayerHandle,
  state: CurrentSlideResponse,
  onPlaying: () => Promise<void>,
): Promise<boolean> {
  const videos = videosForState(layer, state);
  try {
    await Promise.all(
      videos.map(({ video }) =>
        withTimeout(video.play(), VIDEO_READY_TIMEOUT_MS),
      ),
    );
    armSegmentEndGuard(layer, state);
    if (state.waitingForPlayback && videos.length > 0) {
      onPlaying().catch(() => undefined);
    }
    return true;
  } catch {
    for (const { video } of videos) clearVideo(video);
    return false;
  }
}

function waitForVideoMetadata(video: HTMLVideoElement): Promise<void> {
  if (video.error) return Promise.reject(new Error('Video failed to load'));
  if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', onReady);
      video.removeEventListener('error', onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Video failed to load'));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Video readiness timed out'));
    }, VIDEO_READY_TIMEOUT_MS);
    video.addEventListener('loadedmetadata', onReady);
    video.addEventListener('error', onError);
  });
}

function waitForVideoData(video: HTMLVideoElement): Promise<void> {
  if (video.error) return Promise.reject(new Error('Video data failed to load'));
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('canplay', onReady);
      video.removeEventListener('error', onError);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Video data failed to load'));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Video data timed out'));
    }, VIDEO_READY_TIMEOUT_MS);
    video.addEventListener('loadeddata', onReady);
    video.addEventListener('canplay', onReady);
    video.addEventListener('error', onError);
  });
}

function seekVideo(video: HTMLVideoElement, timeSeconds: number): Promise<void> {
  if (Math.abs(video.currentTime - timeSeconds) < 0.05) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timeout);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
    };
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Video seek failed'));
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Video seek timed out'));
    }, VIDEO_READY_TIMEOUT_MS);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.currentTime = timeSeconds;
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Video playback timed out')),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function pauseLayerVideos(layer: SlideLayerHandle): void {
  for (const video of layer.videos) video.pause();
}

/**
 * Caps every video's visible playback at its configured segment. The
 * slideshow otherwise relies on the next poll to replace the slide — if
 * that poll is late, a long clip would visibly overrun its slot and a
 * short clip (loop=true) would repeat indefinitely. Long clips freeze via
 * a timeupdate check at videoStartOffsetMs + imageDurationMs. Short clips
 * are allowed exactly one wrap: the 'ended' handler drops the loop flag,
 * so the first repetition runs to the clip's natural end and holds on its
 * last frame until the server advances.
 */
function armSegmentEndGuard(
  layer: SlideLayerHandle,
  state: CurrentSlideResponse,
): void {
  for (const { photo, video } of videosForState(layer, state)) {
    const durationMs = photo.durationMs ?? state.imageDurationMs;
    const loops = state.imageDurationMs > durationMs;
    if (loops) {
      // Short clip: allowed exactly one repetition — the native loop
      // handles the wrap seamlessly, the 'ended' handler drops the flag so
      // the second pass runs to its natural end and freezes there until the
      // server advances, instead of looping forever when a poll is late.
      video.addEventListener(
        'ended',
        () => {
          video.loop = false;
          video.play().catch(() => undefined);
        },
        { once: true },
      );
      continue;
    }
    // Long clip: freeze exactly at the end of the configured segment.
    const segmentEndSeconds =
      (state.videoStartOffsetMs + state.imageDurationMs) / 1000;
    const onTimeUpdate = () => {
      if (video.currentTime >= segmentEndSeconds - 0.05) {
        video.removeEventListener('timeupdate', onTimeUpdate);
        video.pause();
      }
    };
    video.addEventListener('timeupdate', onTimeUpdate);
  }
}

/**
 * Purely a renderer: polls the backend for "what should be showing right
 * now" and displays exactly that, using exactly the effect the backend
 * specifies. It never picks a photo, an effect, or a timing decision of its
 * own — every device running this engine ends up showing the same picture,
 * because they're all rendering the same server-side state.
 */
export class SlideshowEngine {
  private stopped = false;
  private frontIndex: 0 | 1 = 0;
  private hasRenderedFirst = false;
  private currentSlideId: string | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private preparedNextKey: string | null = null;
  private readonly clientId = createClientId();
  private readonly layers: [SlideLayerHandle, SlideLayerHandle];
  private readonly overlay: EffectOverlayHandle;

  constructor(
    layers: [SlideLayerHandle, SlideLayerHandle],
    overlay: EffectOverlayHandle,
  ) {
    this.layers = layers;
    this.overlay = overlay;
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.startHeartbeat();
    await this.sendHeartbeat().catch(() => undefined);
    await this.tick().catch(() => this.scheduleNext(RETRY_AFTER_ERROR_MS));
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.sendDisconnect();
    for (const layer of this.layers) {
      stopKenBurns(layer);
      pauseLayerVideos(layer);
    }
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat().catch(() => undefined);
    }, CLIENT_HEARTBEAT_INTERVAL_MS);
  }

  private sendHeartbeat(): Promise<void> {
    return api.photos.slideshowHeartbeat(this.clientId);
  }

  private sendReady(slideId: string): Promise<void> {
    return this.sendReadyUntilAcknowledged(slideId);
  }

  private async sendReadyUntilAcknowledged(slideId: string): Promise<void> {
    while (!this.stopped) {
      try {
        await api.photos.slideshowReady(this.clientId, slideId);
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
    throw new Error('Slideshow stopped');
  }

  private sendDisconnect(): void {
    const body = JSON.stringify({ clientId: this.clientId });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/photos/slideshow-disconnect', new Blob([body], { type: 'application/json' }));
      return;
    }
    api.photos.slideshowDisconnect(this.clientId).catch(() => undefined);
  }

  private async tick(): Promise<void> {
    if (this.stopped) return;

    let state: CurrentSlideResponse;
    let responseReceivedAt: number;
    try {
      state = await api.photos.currentSlide();
      responseReceivedAt = performance.now();
    } catch {
      this.scheduleNext(RETRY_AFTER_ERROR_MS);
      return;
    }
    if (this.stopped) return;

    if (state.type !== 'empty' && state.slideId !== this.currentSlideId) {
      // Only adopt the new slideId once it actually rendered — if the
      // images failed to load (or a stale/deleted photo briefly slipped
      // through), we deliberately don't mark it as shown, so the very next
      // poll retries instead of getting stuck thinking it's already current.
      const rendered = await this.showSlide(state, responseReceivedAt);
      if (rendered) {
        this.currentSlideId = state.slideId;
        window.dispatchEvent(
          new CustomEvent('fotify:slide-shown', {
            detail: {
              slideId: state.slideId,
              imageDurationMs: state.imageDurationMs,
              photoId:
                state.photos[0]?.mediaType === 'image'
                  ? state.photos[0].id
                  : null,
            },
          }),
        );
      }
      if (!rendered) {
        if (this.stopped) return;
        if (
          state.waitingForPlayback &&
          state.photos.some((photo) => photo.mediaType === 'video')
        ) {
          await api.photos
            .slideshowFailed(this.clientId, state.slideId)
            .catch(() => undefined);
        }
        this.scheduleNext(RETRY_AFTER_ERROR_MS);
        return;
      }
      if (this.stopped) return;
    }

    if (state.next && state.next.photos.length > 0) {
      this.prepareNextSlide(state.next).catch(() => undefined);
    }

    const renderElapsedMs = performance.now() - responseReceivedAt;
    this.scheduleNext(Math.max(0, state.nextPollInMs - renderElapsedMs));
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopped) return;
    this.pollTimer = setTimeout(() => {
      this.tick().catch(() => this.scheduleNext(RETRY_AFTER_ERROR_MS));
    }, delayMs);
  }

  private async prepareNextSlide(
    next: NonNullable<CurrentSlideResponse['next']>,
  ): Promise<void> {
    const key = `${next.type}:${next.photos.map((photo) => photo.id).join(',')}:${next.videoStartOffsetMs}`;
    if (this.preparedNextKey === key) return;
    this.preparedNextKey = key;

    const backIndex = this.frontIndex === 0 ? 1 : 0;
    const layer = this.layers[backIndex];
    stopKenBurns(layer);
    pauseLayerVideos(layer);
    applyStateToLayer(layer, next);

    const videoEntries = next.photos
      .map((photo, index) => ({ photo, video: layer.videos[index] }))
      .filter(({ photo }) => photo.mediaType === 'video');
    try {
      await Promise.all(
        videoEntries.map(async ({ photo, video }) => {
          const expectedUrl = photo.url;
          try {
            await waitForVideoMetadata(video);
            if (video.getAttribute('src') !== expectedUrl) return;
            await seekVideo(video, next.videoStartOffsetMs / 1000);
            if (video.getAttribute('src') !== expectedUrl) return;
            await waitForVideoData(video);
          } catch (error) {
            if (video.getAttribute('src') === expectedUrl) clearVideo(video);
            throw error;
          }
        }),
      );
    } catch (error) {
      if (this.preparedNextKey === key) this.preparedNextKey = null;
      throw error;
    }
  }

  /** Returns whether the slide actually rendered — false means "try again next poll". */
  private async showSlide(
    state: CurrentSlideResponse,
    responseReceivedAt: number,
  ): Promise<boolean> {
    this.preparedNextKey = null;
    if (!this.hasRenderedFirst) {
      // First slide this client has ever seen: nothing to transition from —
      // just preload it and fade the layer straight in.
      const layer = this.layers[this.frontIndex];
      stopKenBurns(layer);
      applyStateToLayer(layer, state);
      applyCinematicLook(layer, state.lookCinematic);
      const results = await preloadAll(
        state.photos.filter((photo) => photo.mediaType === 'image'),
        FIRST_SLIDE_PRELOAD_TIMEOUT_MS,
      );
      if (results.some((ok) => !ok)) {
        return false; // never show a broken/incomplete image — retry next poll
      }
      if (state.type === 'collage' && state.collageLayout) {
        prepareCollageCellsForReveal(layer, state.collageLayout);
      }
      if (
        !(await prepareLayerVideos(
          layer,
          state,
          responseReceivedAt,
          () => this.stopped,
        ))
      )
        return false;
      layer.container.style.opacity = '1';
      if (state.type === 'collage' && state.collageLayout) {
        revealCollageCells(layer, state.collageLayout);
      }
      startKenBurns(layer, state.imageDurationMs + state.transitionDurationMs);
      if (
        !(await playLayerVideos(layer, state, () =>
          this.sendReady(state.slideId),
        ))
      ) {
        layer.container.style.opacity = '0';
        return false;
      }
      this.hasRenderedFirst = true;
      return true;
    }

    const backIndex = this.frontIndex === 0 ? 1 : 0;
    const backLayer = this.layers[backIndex];
    const frontLayer = this.layers[this.frontIndex];
    const collageLayout = state.type === 'collage' ? state.collageLayout : null;
    const shouldRevealCollage = collageLayout !== null;

    backLayer.container.style.visibility = '';
    stopKenBurns(backLayer);
    applyStateToLayer(backLayer, state);
    applyCinematicLook(backLayer, state.lookCinematic);
    // Usually already warmed via the previous tick's "next" preload, so this
    // resolves near-instantly; the timeout is just a safety net.
    const results = await preloadAll(
      state.photos.filter((photo) => photo.mediaType === 'image'),
      Math.max(MIN_TRANSITION_PRELOAD_MS, state.transitionDurationMs),
    );
    if (results.some((ok) => !ok)) {
      return false; // stay on the current slide rather than transition to a broken one
    }

    if (state.effect === 'zoom') {
      startKenBurns(
        backLayer,
        state.imageDurationMs + state.transitionDurationMs,
      );
    }

    if (
        !(await prepareLayerVideos(
        backLayer,
        state,
        responseReceivedAt,
        () => this.stopped,
      ))
    ) {
      pauseLayerVideos(backLayer);
      return false;
    }

    if (
      !state.waitingForPlayback &&
      !(await playLayerVideos(backLayer, state, () =>
        this.sendReady(state.slideId),
      ))
    ) {
      return false;
    }

    if (shouldRevealCollage) backLayer.container.style.visibility = 'hidden';
    // Start the incoming video *before* the transition so it is already
    // playing when the fade reveals it — otherwise the effect crossfades
    // into a frozen first frame and playback visibly kicks in afterwards.
    if (
      state.waitingForPlayback &&
      !(await playLayerVideos(backLayer, state, () =>
        this.sendReady(state.slideId),
      ))
    ) {
      return false;
    }
    pauseLayerVideos(frontLayer);
    try {
      await runTransition(state.effect, {
        incoming: backLayer,
        outgoing: frontLayer,
        overlay: this.overlay,
        transitionDurationMs: state.transitionDurationMs,
      });
    } finally {
      if (shouldRevealCollage) {
        prepareCollageCellsForReveal(backLayer, collageLayout);
        backLayer.container.style.visibility = '';
      }
    }
    if (shouldRevealCollage) {
      revealCollageCells(backLayer, collageLayout);
    }

    frontLayer.container.style.opacity = '0';
    pauseLayerVideos(frontLayer);
    this.frontIndex = backIndex;
    return true;
  }
}

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

/** Renders single/triple/empty slides via the existing uniform CSS Grid. */
function applyGridLayout(layer: SlideLayerHandle, state: Renderable): void {
  layer.container.style.clipPath = '';
  layer.container.style.display = 'grid';
  const shape = gridShapeFor(state.photos.length);
  layer.container.style.gridTemplateColumns = shape.columns;
  layer.container.style.gridTemplateRows = shape.rows;
  layer.images.forEach((img, index) => {
    const cell = img.parentElement as HTMLElement | null;
    const caption = layer.captions[index] as HTMLElement | undefined;
    const photo = state.photos[index];
    if (cell) resetCollageStyles(cell);
    if (!photo) {
      if (cell) cell.style.display = 'none';
      img.removeAttribute('src');
      if (caption) caption.textContent = '';
      return;
    }
    if (cell) cell.style.display = 'block';
    img.style.objectFit =
      state.type === 'single' && photo.orientation === 'portrait'
        ? 'contain'
        : 'cover';
    if (img.getAttribute('src') !== photo.url) {
      img.src = photo.url;
    }
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

  layer.images.forEach((img, index) => {
    const cell = img.parentElement as HTMLElement | null;
    const caption = layer.captions[index] as HTMLElement | undefined;
    const spec = template.cells[index];
    const photo = photos[index];

    if (!cell) return;
    if (!spec || !photo) {
      cell.style.display = 'none';
      resetCollageStyles(cell);
      img.removeAttribute('src');
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
    if (img.getAttribute('src') !== photo.url) {
      img.src = photo.url;
    }
    if (caption)
      caption.textContent = template.showCaptions
        ? formatCaption(photo, false)
        : '';
  });
}

function applyStateToLayer(layer: SlideLayerHandle, state: Renderable): void {
  if (state.type === 'collage' && state.collageLayout) {
    applyCollageLayout(layer, state.collageLayout, state.photos);
    return;
  }
  applyGridLayout(layer, state);
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
    await this.tick();
  }

  stop(): void {
    this.stopped = true;
    if (this.pollTimer !== null) clearTimeout(this.pollTimer);
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.sendDisconnect();
    for (const layer of this.layers) stopKenBurns(layer);
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
    try {
      state = await api.photos.currentSlide();
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
      const rendered = await this.showSlide(state);
      if (rendered) {
        this.currentSlideId = state.slideId;
        window.dispatchEvent(
          new CustomEvent('fotify:slide-shown', {
            detail: {
              slideId: state.slideId,
              imageDurationMs: state.imageDurationMs,
              photoId: state.photos[0]?.id ?? null,
            },
          }),
        );
      }
      if (this.stopped) return;
    }

    // Warm the backend-declared "next" slide's images now, during the
    // current display window, so the eventual switch to it is instant —
    // this is a rendering optimization, not a decision: the server already
    // decided what's next, we're just fetching bytes ahead of time.
    if (state.next && state.next.photos.length > 0) {
      preloadAll(
        state.next.photos.map((p) => p.url),
        Math.max(MIN_TRANSITION_PRELOAD_MS, state.nextPollInMs),
      ).catch(() => undefined);
    }

    this.scheduleNext(state.nextPollInMs);
  }

  private scheduleNext(delayMs: number): void {
    if (this.stopped) return;
    this.pollTimer = setTimeout(() => {
      this.tick().catch(() => undefined);
    }, delayMs);
  }

  /** Returns whether the slide actually rendered — false means "try again next poll". */
  private async showSlide(state: CurrentSlideResponse): Promise<boolean> {
    const urls = state.photos.map((p) => p.url);

    if (!this.hasRenderedFirst) {
      // First slide this client has ever seen: nothing to transition from —
      // just preload it and fade the layer straight in.
      const layer = this.layers[this.frontIndex];
      applyStateToLayer(layer, state);
      applyCinematicLook(layer, state.lookCinematic);
      const results = await preloadAll(urls, FIRST_SLIDE_PRELOAD_TIMEOUT_MS);
      if (results.some((ok) => !ok)) {
        return false; // never show a broken/incomplete image — retry next poll
      }
      if (state.type === 'collage' && state.collageLayout) {
        prepareCollageCellsForReveal(layer, state.collageLayout);
      }
      layer.container.style.opacity = '1';
      if (state.type === 'collage' && state.collageLayout) {
        revealCollageCells(layer, state.collageLayout);
      }
      startKenBurns(layer, state.imageDurationMs + state.transitionDurationMs);
      this.hasRenderedFirst = true;
      return true;
    }

    const backIndex = this.frontIndex === 0 ? 1 : 0;
    const backLayer = this.layers[backIndex];
    const frontLayer = this.layers[this.frontIndex];
    const collageLayout = state.type === 'collage' ? state.collageLayout : null;
    const shouldRevealCollage = collageLayout !== null;

    backLayer.container.style.visibility = '';
    applyStateToLayer(backLayer, state);
    applyCinematicLook(backLayer, state.lookCinematic);
    // Usually already warmed via the previous tick's "next" preload, so this
    // resolves near-instantly; the timeout is just a safety net.
    const results = await preloadAll(
      urls,
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

    if (shouldRevealCollage) backLayer.container.style.visibility = 'hidden';
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
    this.frontIndex = backIndex;
    return true;
  }
}

import type { SlideLayerHandle } from './SlideLayer';
import type { EffectOverlayHandle } from './EffectOverlay';
import type { ResolvedEffect } from '../api/types';

export type EffectName = ResolvedEffect;

export interface TransitionContext {
  incoming: SlideLayerHandle;
  outgoing: SlideLayerHandle;
  overlay: EffectOverlayHandle;
  transitionDurationMs: number;
}

// The one easing used throughout: a standard ease-in-out for crossfades and filter sweeps.
const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

const kenBurnsAnimations = new WeakMap<Element, Animation>();

/** Starts a slow continuous scale on a layer's images, lasting its full reign as the front layer. */
export function startKenBurns(layer: SlideLayerHandle, durationMs: number): void {
  for (const media of layer.media) {
    kenBurnsAnimations.get(media)?.cancel();
    if (!media.getAttribute('src') || media.style.display === 'none') continue;
    const targetScale = 1.06 + Math.random() * 0.05;
    const anim = media.animate(
      [{ transform: 'scale(1)' }, { transform: `scale(${targetScale.toFixed(3)})` }],
      { duration: durationMs, easing: 'linear', fill: 'forwards' },
    );
    kenBurnsAnimations.set(media, anim);
  }
}

export function stopKenBurns(layer: SlideLayerHandle): void {
  for (const media of layer.media) {
    kenBurnsAnimations.get(media)?.cancel();
    media.style.transform = 'scale(1)';
  }
}

const CINEMATIC_FILTER = 'contrast(1.1) saturate(1.2) brightness(0.95) sepia(0.15) hue-rotate(-5deg)';

/**
 * Applies (or clears) a persistent cinematic color grade on a layer's
 * photos — a per-photo "look" rather than a transition effect, so it's set
 * directly on the <img> elements (like Ken Burns) rather than through
 * runTransition, which always resets the *container's* filter back to
 * neutral once a transition finishes.
 */
export function applyCinematicLook(layer: SlideLayerHandle, enabled: boolean): void {
  for (const media of layer.media) {
    media.style.filter = enabled ? CINEMATIC_FILTER : 'none';
  }
}

/**
 * Cancels any animation left running on a layer's container (e.g. a
 * fill:'forwards' effect from two cycles ago, when this same layer was last
 * used) and resets every property any transition might have touched, so
 * each new transition starts from a guaranteed-neutral base regardless of
 * which effect ran before it. Also cleans up per-cell/per-image state
 * (opacity, transform, any leftover tile-grid DOM) left by effects that
 * animate individual cells rather than the whole container — staggerFade
 * and cubeBuild both do this.
 */
function neutralizeLayer(layer: SlideLayerHandle): void {
  for (const anim of layer.container.getAnimations()) anim.cancel();
  const style = layer.container.style;
  style.transform = 'none';
  style.filter = 'none';
  style.clipPath = 'none';
  style.zIndex = '';

  for (const cell of layer.cells) {
    for (const anim of cell.getAnimations()) anim.cancel();
    cell.style.opacity = '';
  }
}

function neutralizeOverlay(overlay: EffectOverlayHandle): void {
  for (const el of [overlay.wash, overlay.grain, overlay.bloom, overlay.vignette, overlay.particles]) {
    for (const anim of el.getAnimations()) anim.cancel();
    el.style.opacity = '0';
    el.style.transform = 'none';
    el.style.backgroundPosition = '';
  }
}

async function runFade(ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, transitionDurationMs } = ctx;
  const opts: KeyframeAnimationOptions = { duration: transitionDurationMs, easing: EASE, fill: 'forwards' };
  const outAnim = outgoing.container.animate([{ opacity: 1 }, { opacity: 0 }], opts);
  const inAnim = incoming.container.animate([{ opacity: 0 }, { opacity: 1 }], opts);
  await Promise.all([outAnim.finished, inAnim.finished]);
}

async function runZoomCrossfade(ctx: TransitionContext): Promise<void> {
  // The transition swap itself is a plain crossfade; the distinguishing
  // continuous scale is driven separately by startKenBurns() for the
  // incoming layer's entire reign as the front layer.
  await runFade(ctx);
}

/** Soft-focus dissolve: outgoing blurs away while incoming resolves into focus. */
async function runCrossfadeBlur(ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, transitionDurationMs } = ctx;
  const opts: KeyframeAnimationOptions = { duration: transitionDurationMs, easing: EASE, fill: 'forwards' };
  const outAnim = outgoing.container.animate(
    [
      { opacity: 1, filter: 'blur(0px)' },
      { opacity: 0, filter: 'blur(14px)' },
    ],
    opts,
  );
  const inAnim = incoming.container.animate(
    [
      { opacity: 0, filter: 'blur(14px)' },
      { opacity: 1, filter: 'blur(0px)' },
    ],
    opts,
  );
  await Promise.all([outAnim.finished, inAnim.finished]);
}

/** A gentle breathing scale paired with a crossfade — outgoing grows slightly, incoming settles in from slightly smaller. */
async function runCrossZoom(ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, transitionDurationMs } = ctx;
  const opts: KeyframeAnimationOptions = { duration: transitionDurationMs, easing: EASE, fill: 'forwards' };
  const outAnim = outgoing.container.animate(
    [
      { opacity: 1, transform: 'scale(1)' },
      { opacity: 0, transform: 'scale(1.06)' },
    ],
    opts,
  );
  const inAnim = incoming.container.animate(
    [
      { opacity: 0, transform: 'scale(0.94)' },
      { opacity: 1, transform: 'scale(1)' },
    ],
    opts,
  );
  await Promise.all([outAnim.finished, inAnim.finished]);
}

/** Cinematic dip to black: outgoing fades out, a brief hold on black, then incoming fades in. */
async function runDipToBlack(ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, transitionDurationMs } = ctx;
  const opts: KeyframeAnimationOptions = { duration: transitionDurationMs, easing: EASE, fill: 'forwards' };
  const outAnim = outgoing.container.animate(
    [
      { opacity: 1, offset: 0 },
      { opacity: 0, offset: 0.45 },
      { opacity: 0, offset: 1 },
    ],
    opts,
  );
  const inAnim = incoming.container.animate(
    [
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: 0.55 },
      { opacity: 1, offset: 1 },
    ],
    opts,
  );
  await Promise.all([outAnim.finished, inAnim.finished]);
}

/** Same idea as dipToBlack but dips through a white wash instead of the black backdrop. */
async function runDipToWhite(ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, overlay, transitionDurationMs } = ctx;
  const opts: KeyframeAnimationOptions = { duration: transitionDurationMs, easing: EASE, fill: 'forwards' };
  const outAnim = outgoing.container.animate(
    [
      { opacity: 1, offset: 0 },
      { opacity: 0, offset: 0.45 },
      { opacity: 0, offset: 1 },
    ],
    opts,
  );
  const washAnim = overlay.wash.animate(
    [
      { opacity: 0, offset: 0 },
      { opacity: 1, offset: 0.45 },
      { opacity: 1, offset: 0.55 },
      { opacity: 0, offset: 1 },
    ],
    opts,
  );
  const inAnim = incoming.container.animate(
    [
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: 0.55 },
      { opacity: 1, offset: 1 },
    ],
    opts,
  );
  await Promise.all([outAnim.finished, washAnim.finished, inAnim.finished]);
}

/** A plain crossfade with a nostalgic film-grain pulse layered over the swap. */
async function runFilmGrain(ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, overlay, transitionDurationMs } = ctx;
  const opts: KeyframeAnimationOptions = { duration: transitionDurationMs, easing: EASE, fill: 'forwards' };
  const outAnim = outgoing.container.animate([{ opacity: 1 }, { opacity: 0 }], opts);
  const inAnim = incoming.container.animate([{ opacity: 0 }, { opacity: 1 }], opts);
  const grainAnim = overlay.grain.animate(
    [
      { opacity: 0, offset: 0 },
      { opacity: 0.22, offset: 0.3 },
      { opacity: 0.22, offset: 0.7 },
      { opacity: 0, offset: 1 },
    ],
    opts,
  );
  await Promise.all([outAnim.finished, inAnim.finished, grainAnim.finished]);
}

/** Color gently drains out of the outgoing photo and returns as the incoming one settles in. */
async function runColorBreath(ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, transitionDurationMs } = ctx;
  const opts: KeyframeAnimationOptions = { duration: transitionDurationMs, easing: EASE, fill: 'forwards' };
  const outAnim = outgoing.container.animate(
    [
      { opacity: 1, filter: 'saturate(1)' },
      { opacity: 0, filter: 'saturate(0)' },
    ],
    opts,
  );
  const inAnim = incoming.container.animate(
    [
      { opacity: 0, filter: 'saturate(0)' },
      { opacity: 1, filter: 'saturate(1)' },
    ],
    opts,
  );
  await Promise.all([outAnim.finished, inAnim.finished]);
}

/** A warm, off-center light flare blooms up during the crossfade — a wedding/travel-film staple. */
async function runLightLeak(ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, overlay, transitionDurationMs } = ctx;
  const opts: KeyframeAnimationOptions = { duration: transitionDurationMs, easing: EASE, fill: 'forwards' };
  const outAnim = outgoing.container.animate([{ opacity: 1 }, { opacity: 0 }], opts);
  const inAnim = incoming.container.animate([{ opacity: 0 }, { opacity: 1 }], opts);
  overlay.bloom.style.background =
    'radial-gradient(circle at 28% 22%, rgba(255,205,140,0.95), rgba(255,150,60,0.45) 35%, transparent 68%)';
  const bloomAnim = overlay.bloom.animate(
    [
      { opacity: 0, transform: 'scale(0.9)', offset: 0 },
      { opacity: 0.55, transform: 'scale(1.1)', offset: 0.5 },
      { opacity: 0, transform: 'scale(1.25)', offset: 1 },
    ],
    opts,
  );
  await Promise.all([outAnim.finished, inAnim.finished, bloomAnim.finished]);
}

/** The frame edges darken into a vignette and relax again, right through the crossfade. */
async function runVignettePulse(ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, overlay, transitionDurationMs } = ctx;
  const opts: KeyframeAnimationOptions = { duration: transitionDurationMs, easing: EASE, fill: 'forwards' };
  const outAnim = outgoing.container.animate([{ opacity: 1 }, { opacity: 0 }], opts);
  const inAnim = incoming.container.animate([{ opacity: 0 }, { opacity: 1 }], opts);
  const vignetteAnim = overlay.vignette.animate(
    [
      { opacity: 0, offset: 0 },
      { opacity: 0.85, offset: 0.5 },
      { opacity: 0, offset: 1 },
    ],
    opts,
  );
  await Promise.all([outAnim.finished, inAnim.finished, vignetteAnim.finished]);
}

/** Camera-style rack focus: outgoing pulls out of focus first, incoming arrives blurred and resolves sharp. */
async function runRackFocus(ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, transitionDurationMs } = ctx;
  const opts: KeyframeAnimationOptions = { duration: transitionDurationMs, easing: EASE, fill: 'forwards' };
  const outAnim = outgoing.container.animate(
    [
      { opacity: 1, filter: 'blur(0px)', offset: 0 },
      { opacity: 1, filter: 'blur(16px)', offset: 0.5 },
      { opacity: 0, filter: 'blur(16px)', offset: 1 },
    ],
    opts,
  );
  const inAnim = incoming.container.animate(
    [
      { opacity: 0, filter: 'blur(16px)', offset: 0 },
      { opacity: 1, filter: 'blur(16px)', offset: 0.5 },
      { opacity: 1, filter: 'blur(0px)', offset: 1 },
    ],
    opts,
  );
  await Promise.all([outAnim.finished, inAnim.finished]);
}

/** A brief shared brightness spike at the midpoint, like a camera flash between two shots. */
async function runExposureFlash(ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, transitionDurationMs } = ctx;
  const opts: KeyframeAnimationOptions = { duration: transitionDurationMs, easing: EASE, fill: 'forwards' };
  const outAnim = outgoing.container.animate(
    [
      { opacity: 1, filter: 'brightness(1)', offset: 0 },
      { opacity: 0.6, filter: 'brightness(1.9)', offset: 0.5 },
      { opacity: 0, filter: 'brightness(1)', offset: 1 },
    ],
    opts,
  );
  const inAnim = incoming.container.animate(
    [
      { opacity: 0, filter: 'brightness(1.9)', offset: 0 },
      { opacity: 0.6, filter: 'brightness(1.9)', offset: 0.5 },
      { opacity: 1, filter: 'brightness(1)', offset: 1 },
    ],
    opts,
  );
  await Promise.all([outAnim.finished, inAnim.finished]);
}

/** A soft centered white bloom pulses outward through the crossfade, like a gentle lens glow. */
async function runRadialBloom(ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, overlay, transitionDurationMs } = ctx;
  const opts: KeyframeAnimationOptions = { duration: transitionDurationMs, easing: EASE, fill: 'forwards' };
  const outAnim = outgoing.container.animate([{ opacity: 1 }, { opacity: 0 }], opts);
  const inAnim = incoming.container.animate([{ opacity: 0 }, { opacity: 1 }], opts);
  overlay.bloom.style.background =
    'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.95), rgba(255,244,214,0.35) 45%, transparent 72%)';
  const bloomAnim = overlay.bloom.animate(
    [
      { opacity: 0, transform: 'scale(0.75)', offset: 0 },
      { opacity: 0.65, transform: 'scale(1.15)', offset: 0.5 },
      { opacity: 0, transform: 'scale(1.35)', offset: 1 },
    ],
    opts,
  );
  await Promise.all([outAnim.finished, inAnim.finished, bloomAnim.finished]);
}

/** Outgoing shifts into a stylized duotone as it fades; incoming starts duotone and settles into full color. */
async function runDuotone(ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, transitionDurationMs } = ctx;
  const opts: KeyframeAnimationOptions = { duration: transitionDurationMs, easing: EASE, fill: 'forwards' };
  const outAnim = outgoing.container.animate(
    [
      { opacity: 1, filter: 'grayscale(0) contrast(1) hue-rotate(0deg)' },
      { opacity: 0, filter: 'grayscale(0.9) contrast(1.3) hue-rotate(-10deg)' },
    ],
    opts,
  );
  const inAnim = incoming.container.animate(
    [
      { opacity: 0, filter: 'grayscale(0.9) contrast(1.3) hue-rotate(10deg)' },
      { opacity: 1, filter: 'grayscale(0) contrast(1) hue-rotate(0deg)' },
    ],
    opts,
  );
  await Promise.all([outAnim.finished, inAnim.finished]);
}

/**
 * For a triple (3-portrait) slide, each cell fades in one after another
 * rather than all at once; a single-photo slide just gets a plain fade
 * (there's only one cell, so "staggering" has nothing to stagger).
 */
async function runStaggerFade(ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, transitionDurationMs } = ctx;
  const outOpts: KeyframeAnimationOptions = { duration: transitionDurationMs, easing: EASE, fill: 'forwards' };
  const outAnim = outgoing.container.animate([{ opacity: 1 }, { opacity: 0 }], outOpts);

  incoming.container.style.opacity = '1';
  const cells = incoming.images
    .map((img) => img.parentElement as HTMLElement | null)
    .filter((cell): cell is HTMLElement => !!cell && cell.style.display !== 'none');

  const count = cells.length;
  const cellAnims = cells.map((cell, i) => {
    cell.style.opacity = '0';
    // Spread the starts evenly across the first ~60% of the duration, so
    // even the last cell still gets a full, unhurried fade of its own.
    const delay = count > 1 ? (i / count) * transitionDurationMs * 0.6 : 0;
    const duration = transitionDurationMs - delay;
    return cell.animate([{ opacity: 0 }, { opacity: 1 }], { duration, delay, easing: EASE, fill: 'forwards' });
  });

  await Promise.all([outAnim.finished, ...cellAnims.map((a) => a.finished)]);
}

/**
 * A crossfade veiled by a uniform, evenly-spaced grid of small gray
 * squares — a plain static texture (not randomly flickering, not
 * drifting) that simply fades in and back out with the transition.
 */
async function runDustParticles(ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, overlay, transitionDurationMs } = ctx;
  const opts: KeyframeAnimationOptions = { duration: transitionDurationMs, easing: EASE, fill: 'forwards' };
  const outAnim = outgoing.container.animate([{ opacity: 1 }, { opacity: 0 }], opts);
  const inAnim = incoming.container.animate([{ opacity: 0 }, { opacity: 1 }], opts);
  const particlesAnim = overlay.particles.animate(
    [{ opacity: 0 }, { opacity: 0.6, offset: 0.5 }, { opacity: 0 }],
    opts,
  );
  await Promise.all([outAnim.finished, inAnim.finished, particlesAnim.finished]);
}

const EFFECT_RUNNERS: Record<EffectName, (ctx: TransitionContext) => Promise<void>> = {
  fade: runFade,
  zoom: runZoomCrossfade,
  crossfadeBlur: runCrossfadeBlur,
  crossZoom: runCrossZoom,
  dipToBlack: runDipToBlack,
  dipToWhite: runDipToWhite,
  filmGrain: runFilmGrain,
  colorBreath: runColorBreath,
  lightLeak: runLightLeak,
  vignettePulse: runVignettePulse,
  rackFocus: runRackFocus,
  exposureFlash: runExposureFlash,
  radialBloom: runRadialBloom,
  duotone: runDuotone,
  staggerFade: runStaggerFade,
  dustParticles: runDustParticles,
};

export async function runTransition(effect: EffectName, ctx: TransitionContext): Promise<void> {
  const { incoming, outgoing, overlay } = ctx;
  // Clear out anything a stale animation from an earlier cycle left behind
  // (each layer alternates front/back, so this same container last carried
  // a *different* effect two cycles ago).
  neutralizeLayer(incoming);
  neutralizeLayer(outgoing);
  neutralizeOverlay(overlay);

  await EFFECT_RUNNERS[effect](ctx);

  // Release this transition's animations and commit the one authoritative
  // end state (incoming fully visible, outgoing hidden) regardless of which
  // effect-specific properties (filter/transform/clip-path/overlay) were
  // touched along the way.
  neutralizeLayer(incoming);
  neutralizeLayer(outgoing);
  neutralizeOverlay(overlay);
  incoming.container.style.opacity = '1';
  outgoing.container.style.opacity = '0';
}

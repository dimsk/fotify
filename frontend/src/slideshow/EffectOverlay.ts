export interface EffectOverlayHandle {
  /** Solid wash (white by default) used by effects that dip through a color, e.g. dipToWhite. */
  wash: HTMLElement;
  /** Film-grain noise texture, used by filmGrain. */
  grain: HTMLElement;
  /** Soft radial gradient — background/gradient set per-effect (lightLeak, radialBloom). */
  bloom: HTMLElement;
  /** Radial edge-darkening gradient, used by vignettePulse. */
  vignette: HTMLElement;
  /** Soft drifting dot pattern, used by dustParticles. */
  particles: HTMLElement;
}

export function getEffectOverlayHandle(container: HTMLDivElement | null): EffectOverlayHandle | null {
  if (!container) return null;
  const wash = container.querySelector<HTMLElement>('[data-fx="wash"]');
  const grain = container.querySelector<HTMLElement>('[data-fx="grain"]');
  const bloom = container.querySelector<HTMLElement>('[data-fx="bloom"]');
  const vignette = container.querySelector<HTMLElement>('[data-fx="vignette"]');
  const particles = container.querySelector<HTMLElement>('[data-fx="particles"]');
  if (!wash || !grain || !bloom || !vignette || !particles) return null;
  return { wash, grain, bloom, vignette, particles };
}

import { TransitionEffect } from '../settings/settings.entity';

export type EffectName =
  | 'fade'
  | 'zoom'
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

const ALL_EFFECTS: EffectName[] = [
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
];

/**
 * Resolves the configured effect pool to a single concrete effect for the
 * next transition, avoiding an immediate repeat when there's more than one
 * candidate to choose from. `['random']` (or an empty pool) means "pick
 * from everything"; any other pool is used as-is (a one-element pool
 * always resolves to that same effect, with no randomization).
 */
export function pickEffect(effects: TransitionEffect[], lastUsed: EffectName | null): EffectName {
  const pool: EffectName[] =
    effects.length === 0 || effects.includes('random') ? ALL_EFFECTS : (effects as EffectName[]);
  const candidates = lastUsed && pool.length > 1 ? pool.filter((e) => e !== lastUsed) : pool;
  return candidates[Math.floor(Math.random() * candidates.length)] ?? pool[0];
}

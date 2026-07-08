import { CollageLayoutSelection, CollageLayoutType } from '../settings/settings.entity';

/** Every layout type the frontend has a template for, with the exact photo count that template needs. */
export const COLLAGE_LAYOUT_PHOTO_COUNTS: Record<CollageLayoutType, number> = {
  heartCutout: 5,
  heartMosaic: 10,
  diamondGridDense: 12,
  diamondGridLarge: 8,
  diamondClusterTight: 9,
  diamondClusterScatter: 11,
  heroWithSupporting: 8,
  threeTopTwoBottom: 5,
  scrapbookScatter: 10,
  editorialMasonry: 12,
};

export const ALL_COLLAGE_LAYOUTS = Object.keys(COLLAGE_LAYOUT_PHOTO_COUNTS) as CollageLayoutType[];

/**
 * Picks one concrete layout to use for a collage slide. An empty selection
 * or one containing 'random' means "any of the 10 are fair game"; otherwise
 * picks uniformly among the admin's chosen subset.
 */
export function pickCollageLayout(selection: CollageLayoutSelection[]): CollageLayoutType {
  const concrete = selection.filter((s): s is CollageLayoutType => s !== 'random');
  const pool = selection.length === 0 || selection.includes('random') || concrete.length === 0 ? ALL_COLLAGE_LAYOUTS : concrete;
  return pool[Math.floor(Math.random() * pool.length)];
}

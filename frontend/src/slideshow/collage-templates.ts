import type { CollageLayoutType } from '../api/types';

export interface CollageCellSpec {
  left: number; // percent
  top: number; // percent
  width: number; // percent
  height: number; // percent
  rotate?: number; // degrees
  clipPath?: string;
  radius?: number; // percent border-radius
  z?: number;
}

export interface CollageTemplate {
  cells: CollageCellSpec[];
  /** Clip-path applied to the whole layer (not per-cell) — used to carve an overall silhouette (heart/diamond) out of a plain internal grid. */
  groupClipPath?: string;
  /** Only the two clean, axis-aligned layouts show the capture-date caption — on rotated/masked tiles an unrotated label would look broken. */
  showCaptions?: boolean;
}

/** Smooth heart silhouette — references the <clipPath> defined once in SlideshowPage.tsx (objectBoundingBox, so it scales to whatever box it's applied to) rather than a hand-drawn polygon. */
const HEART_CLIP = 'url(#fotify-heart-clip)';
const DIAMOND_CLIP = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';

function diamond(cx: number, cy: number, size: number, extra?: Partial<CollageCellSpec>): CollageCellSpec {
  return { left: cx - size / 2, top: cy - size / 2, width: size, height: size, rotate: 45, ...extra };
}

/**
 * Lays out rotated squares ("diamonds") tessellated edge-to-edge — alternating
 * rows offset by half a diamond width, rows spaced by half a diamond height —
 * the standard argyle/harlequin tiling. `rowCounts[i]` is how many diamonds
 * sit in row i; rows deliberately bleed past the 0-100 bounds at the edges
 * (cropped by the layer's overflow:hidden), matching the reference images.
 */
function diamondGrid(rowCounts: number[], size: number): CollageCellSpec[] {
  const diag = size * Math.SQRT2;
  const rowGap = diag / 2;
  const totalHeight = (rowCounts.length - 1) * rowGap;
  const startY = 50 - totalHeight / 2;
  const cells: CollageCellSpec[] = [];
  rowCounts.forEach((count, r) => {
    const cy = startY + r * rowGap;
    const offset = r % 2 === 1 ? diag / 2 : 0;
    const rowWidth = (count - 1) * diag;
    const startX = 50 - rowWidth / 2 + offset;
    for (let c = 0; c < count; c++) {
      cells.push(diamond(startX + c * diag, cy, size));
    }
  });
  return cells;
}

export const COLLAGE_TEMPLATES: Record<CollageLayoutType, CollageTemplate> = {
  heartCutout: {
    cells: [
      { left: 1, top: 1, width: 47, height: 47 },
      { left: 52, top: 1, width: 47, height: 47 },
      { left: 1, top: 52, width: 47, height: 47 },
      { left: 52, top: 52, width: 47, height: 47 },
      { left: 30, top: 27, width: 40, height: 46, clipPath: HEART_CLIP, z: 10 },
    ],
  },

  heartMosaic: {
    groupClipPath: HEART_CLIP,
    cells: [
      // Row 1 (top, widest — the two heart lobes): 4 cells
      { left: 4, top: 0, width: 21, height: 21 },
      { left: 27, top: 0, width: 21, height: 21 },
      { left: 52, top: 0, width: 21, height: 21 },
      { left: 75, top: 0, width: 21, height: 21 },
      // Row 2: 3 cells
      { left: 12, top: 23, width: 24, height: 21 },
      { left: 38, top: 23, width: 24, height: 21 },
      { left: 64, top: 23, width: 24, height: 21 },
      // Row 3: 2 cells
      { left: 22, top: 46, width: 24, height: 21 },
      { left: 54, top: 46, width: 24, height: 21 },
      // Row 4 (bottom point): 1 cell
      { left: 38, top: 69, width: 24, height: 21 },
    ],
  },

  diamondGridDense: { cells: diamondGrid([3, 3, 3, 3], 32) },

  diamondGridLarge: { cells: diamondGrid([3, 2, 3], 46) },

  diamondClusterTight: {
    groupClipPath: DIAMOND_CLIP,
    cells: [
      { left: -5, top: -5, width: 38, height: 38 },
      { left: 31, top: -5, width: 38, height: 38 },
      { left: 67, top: -5, width: 38, height: 38 },
      { left: -5, top: 31, width: 38, height: 38 },
      { left: 31, top: 31, width: 38, height: 38 },
      { left: 67, top: 31, width: 38, height: 38 },
      { left: -5, top: 67, width: 38, height: 38 },
      { left: 31, top: 67, width: 38, height: 38 },
      { left: 67, top: 67, width: 38, height: 38 },
    ],
  },

  diamondClusterScatter: {
    cells: [
      { left: 38, top: 2, width: 22, height: 18, rotate: -4 },
      { left: 14, top: 16, width: 20, height: 18, rotate: 6 },
      { left: 62, top: 14, width: 20, height: 18, rotate: -6 },
      { left: 2, top: 38, width: 18, height: 20, rotate: 4 },
      { left: 26, top: 32, width: 22, height: 20, rotate: -3 },
      { left: 52, top: 34, width: 22, height: 20, rotate: 5 },
      { left: 78, top: 36, width: 18, height: 20, rotate: -5 },
      { left: 14, top: 58, width: 20, height: 20, rotate: 3 },
      { left: 40, top: 60, width: 22, height: 20, rotate: -4 },
      { left: 64, top: 58, width: 20, height: 20, rotate: 6 },
      { left: 38, top: 80, width: 22, height: 18, rotate: -2 },
    ],
  },

  heroWithSupporting: {
    showCaptions: true,
    cells: [
      { left: 2, top: 2, width: 29, height: 24 },
      { left: 34, top: 2, width: 29, height: 24 },
      { left: 68, top: 2, width: 30, height: 24 },
      { left: 2, top: 29, width: 29, height: 30 },
      { left: 34, top: 29, width: 64, height: 46 },
      { left: 2, top: 62, width: 47, height: 36 },
      { left: 52, top: 62, width: 46, height: 17 },
      { left: 52, top: 81, width: 46, height: 17 },
    ],
  },

  threeTopTwoBottom: {
    showCaptions: true,
    cells: [
      { left: 0, top: 0, width: 33.3, height: 55 },
      { left: 33.3, top: 0, width: 33.4, height: 55 },
      { left: 66.7, top: 0, width: 33.3, height: 55 },
      { left: 0, top: 55, width: 50, height: 45 },
      { left: 50, top: 55, width: 50, height: 45 },
    ],
  },

  scrapbookScatter: {
    cells: [
      { left: 4, top: 4, width: 27, height: 24, rotate: -6, radius: 4, z: 1 },
      { left: 34, top: 2, width: 25, height: 22, rotate: 5, radius: 4, z: 2 },
      { left: 62, top: 6, width: 27, height: 24, rotate: -4, radius: 4, z: 3 },
      { left: 6, top: 36, width: 25, height: 24, rotate: 7, radius: 4, z: 4 },
      { left: 36, top: 32, width: 27, height: 26, rotate: -7, radius: 4, z: 5 },
      { left: 66, top: 36, width: 26, height: 24, rotate: 6, radius: 4, z: 6 },
      { left: 2, top: 66, width: 26, height: 24, rotate: -5, radius: 4, z: 7 },
      { left: 32, top: 64, width: 26, height: 26, rotate: 4, radius: 4, z: 8 },
      { left: 60, top: 68, width: 27, height: 24, rotate: -6, radius: 4, z: 9 },
      { left: 18, top: 10, width: 20, height: 18, rotate: 8, radius: 4, z: 10 },
    ],
  },

  editorialMasonry: {
    cells: [
      { left: 0, top: 0, width: 25, height: 35 },
      { left: 0, top: 36, width: 25, height: 30 },
      { left: 0, top: 67, width: 25, height: 33 },
      { left: 25, top: 0, width: 25, height: 45 },
      { left: 25, top: 46, width: 25, height: 20, rotate: -4 },
      { left: 25, top: 67, width: 25, height: 33 },
      { left: 50, top: 0, width: 25, height: 25, rotate: 3 },
      { left: 50, top: 26, width: 25, height: 40 },
      { left: 50, top: 67, width: 25, height: 33 },
      { left: 75, top: 0, width: 25, height: 38 },
      { left: 75, top: 39, width: 25, height: 32 },
      { left: 75, top: 72, width: 25, height: 28, rotate: -3 },
    ],
  },
};

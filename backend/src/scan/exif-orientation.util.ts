export interface DisplayDimensions {
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape' | 'square';
}

const ROTATED_ORIENTATION_TAGS = new Set([5, 6, 7, 8]);

/**
 * EXIF orientation tags 5-8 imply a 90deg rotation, which swaps the raw
 * sensor width/height relative to how the image is actually displayed.
 */
export function computeDisplayDimensions(
  rawWidth: number,
  rawHeight: number,
  exifOrientationTag: number | undefined,
): DisplayDimensions {
  const swapped = ROTATED_ORIENTATION_TAGS.has(exifOrientationTag ?? 1);
  const width = swapped ? rawHeight : rawWidth;
  const height = swapped ? rawWidth : rawHeight;
  const orientation = width === height ? 'square' : width > height ? 'landscape' : 'portrait';
  return { width, height, orientation };
}

// No meaningful downscaling — this is purely a safety cap against
// pathological/corrupted files with extreme reported dimensions (protects
// against excessive memory use), not a quality/performance trade-off. No
// real consumer photo gets anywhere near this on its long edge.
export const CACHE_MAX_DIMENSION = 8000;
// Maximum JPEG quality: the cache is a rotation-corrected copy of the
// original, not a bandwidth-saving thumbnail, so it should be visually and
// practically indistinguishable from the source.
export const CACHE_JPEG_QUALITY = 100;

import pLimit from 'p-limit';

/**
 * Shared across scanning (hashing + EXIF/metadata read) and on-demand cache
 * generation (sharp resize/encode) so the process never runs more than this
 * many CPU-heavy image operations at once, regardless of which subsystem
 * triggered them — e.g. a source scan running at the same time the
 * slideshow is prefetching shouldn't let combined CPU work run unbounded.
 * Kept low deliberately: this app is meant to run lightly alongside other
 * services (e.g. on a home NAS), not saturate every core.
 */
export const cpuWorkLimiter = pLimit(2);

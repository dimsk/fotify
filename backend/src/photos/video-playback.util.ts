import { VideoDurationMode } from '../settings/settings.entity';

export function videoDisplayDuration(
  mode: VideoDurationMode,
  videoDurationMs: number,
  imageDurationMs: number,
  maxDurationMs: number,
): number {
  const duration = Math.max(videoDurationMs, 500);
  if (mode === 'photo' || mode === 'random-segment') return imageDurationMs;
  if (mode === 'capped') return Math.min(duration, maxDurationMs);
  return duration;
}

export function randomVideoStartOffset(
  videoDurationMs: number,
  displayDurationMs: number,
  randomValue = Math.random(),
): number {
  const maxOffset = Math.max(0, videoDurationMs - displayDurationMs);
  const boundedRandom = Math.min(Math.max(randomValue, 0), 0.999999999999);
  return Math.floor(boundedRandom * (maxOffset + 1));
}

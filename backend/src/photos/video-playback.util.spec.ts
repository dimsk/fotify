import {
  randomVideoStartOffset,
  videoDisplayDuration,
} from './video-playback.util';

describe('video playback timing', () => {
  it('uses the photo duration for a random segment', () => {
    expect(videoDisplayDuration('random-segment', 85_000, 25_000, 30_000)).toBe(
      25_000,
    );
  });

  it('chooses a stable offset inside the playable range', () => {
    expect(randomVideoStartOffset(85_000, 25_000, 0)).toBe(0);
    expect(randomVideoStartOffset(85_000, 25_000, 0.5)).toBe(30_000);
    expect(randomVideoStartOffset(85_000, 25_000, 1)).toBe(60_000);
  });

  it('starts at zero when the video is shorter than the display duration', () => {
    expect(randomVideoStartOffset(10_000, 25_000, 0.75)).toBe(0);
  });
});

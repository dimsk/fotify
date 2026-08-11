import {
  randomVideoStartOffset,
  videoDisplayDuration,
} from './video-playback.util';

describe('video playback timing', () => {
  it('uses the photo duration for a random segment of a long video', () => {
    expect(videoDisplayDuration('random-segment', 85_000, 25_000, 30_000)).toBe(
      25_000,
    );
  });

  it('ends the slide when a short video ends instead of looping', () => {
    expect(videoDisplayDuration('random-segment', 5_000, 25_000, 30_000)).toBe(
      5_000,
    );
    expect(videoDisplayDuration('photo', 5_000, 25_000, 30_000)).toBe(5_000);
  });

  it('still uses the photo duration when the video is longer', () => {
    expect(videoDisplayDuration('photo', 85_000, 25_000, 30_000)).toBe(25_000);
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

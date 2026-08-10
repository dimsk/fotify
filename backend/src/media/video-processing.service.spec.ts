import { mimeTypeFor } from './video-processing.service';

describe('mimeTypeFor', () => {
  it('maps supported video extensions case-insensitively', () => {
    expect(mimeTypeFor('clip.MP4')).toBe('video/mp4');
    expect(mimeTypeFor('clip.mov')).toBe('video/quicktime');
    expect(mimeTypeFor('clip.webm')).toBe('video/webm');
    expect(mimeTypeFor('clip.mkv')).toBe('video/x-matroska');
    expect(mimeTypeFor('clip.avi')).toBe('video/x-msvideo');
  });
});

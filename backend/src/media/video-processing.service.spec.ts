import { createHash } from 'crypto';
import { Readable, Writable } from 'stream';
import {
  mimeTypeFor,
  VideoProcessingService,
  videoIdentityHash,
} from './video-processing.service';

describe('mimeTypeFor', () => {
  it('maps supported video extensions case-insensitively', () => {
    expect(mimeTypeFor('clip.MP4')).toBe('video/mp4');
    expect(mimeTypeFor('clip.mov')).toBe('video/quicktime');
    expect(mimeTypeFor('clip.webm')).toBe('video/webm');
    expect(mimeTypeFor('clip.mkv')).toBe('video/x-matroska');
    expect(mimeTypeFor('clip.avi')).toBe('video/x-msvideo');
  });
});

describe('VideoProcessingService.hashStream', () => {
  const service = new VideoProcessingService();

  it('hashes the whole stream, teeing the bytes into a sink when given one', async () => {
    const payload = Buffer.alloc(5 * 1024 * 1024, 7);
    for (let i = 0; i < payload.length; i += 4096) payload[i] = i % 251;
    const expected = createHash('sha256').update(payload).digest('hex');

    const sinkChunks: Buffer[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _e: unknown, cb: () => void) {
        sinkChunks.push(chunk);
        cb();
      },
    });

    const hash = await service.hashStream(Readable.from(payload), sink);
    expect(hash).toBe(expected);
    expect(Buffer.concat(sinkChunks).equals(payload)).toBe(true);
  });

  it('hashes without a sink too', async () => {
    const payload = Buffer.from('fotify-video');
    const expected = createHash('sha256').update(payload).digest('hex');
    await expect(service.hashStream(Readable.from(payload))).resolves.toBe(expected);
  });
});

describe('videoIdentityHash', () => {
  it('is a stable sha256-hex function of size and mtime', () => {
    const mtime = new Date('2026-05-03T13:01:00Z');
    const hash = videoIdentityHash(115767536, mtime);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(videoIdentityHash(115767536, new Date(mtime))).toBe(hash);
  });

  it('changes when size or mtime change', () => {
    const mtime = new Date('2026-05-03T13:01:00Z');
    const base = videoIdentityHash(115767536, mtime);
    expect(videoIdentityHash(115767537, mtime)).not.toBe(base);
    expect(
      videoIdentityHash(115767536, new Date(mtime.getTime() + 1000)),
    ).not.toBe(base);
  });

  it('never collides with a content hash of the size+mtime string', () => {
    // Guard: the version prefix must make identity hashes disjoint from any
    // plain content SHA-256 of the same inputs.
    const mtime = new Date('2026-05-03T13:01:00Z');
    const naive = createHash('sha256')
      .update(String(115767536))
      .update(String(mtime.getTime()))
      .digest('hex');
    expect(videoIdentityHash(115767536, mtime)).not.toBe(naive);
  });
});

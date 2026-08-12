import { createHash } from 'crypto';
import { Readable, Writable } from 'stream';
import { mimeTypeFor, VideoProcessingService } from './video-processing.service';

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

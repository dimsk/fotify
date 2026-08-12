import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { extname, join } from 'path';
import { spawn } from 'child_process';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import pLimit from 'p-limit';
import { FileProvider } from '../file-providers/file-provider.interface';
import { PhotoOrientation } from '../photos/photo.entity';

export interface VideoMetadata {
  width: number;
  height: number;
  orientation: PhotoOrientation;
  durationMs: number;
  mimeType: string;
  codec: string | null;
  container: string | null;
}

const transcodeLimiter = pLimit(1);

@Injectable()
export class VideoProcessingService {
  /**
   * Copies a (possibly remote) source file to a local temp file and hands it
   * to `work` together with its sha256 hash. When `maxBytes` is given, only
   * the first `maxBytes` of the source are transferred — used to avoid
   * pulling a multi-hundred-MB source over the network when only a short
   * segment near the start is actually transcoded. A truncated prefix is not
   * hashable against the full source, so `work` receives `null` as the hash
   * in that case and must skip the change-detection hash comparison.
   */
  async withMaterializedFile<T>(
    provider: FileProvider,
    relativePath: string,
    work: (path: string, hash: string | null) => Promise<T>,
    maxBytes?: number,
  ): Promise<T> {
    const dir = await fs.mkdtemp(join(tmpdir(), 'fotify-video-'));
    const path = join(dir, `source${extname(relativePath).toLowerCase()}`);

    try {
      if (maxBytes && maxBytes > 0) {
        const out = createWriteStream(path);
        let written = 0;
        // Counting stream that destroys itself (and thus aborts the upstream
        // network read) once enough bytes have flowed through.
        const counter = new Transform({
          transform(chunk, _encoding, callback) {
            written += chunk.length;
            if (written >= maxBytes) {
              callback(null, chunk);
              counter.destroy();
              return;
            }
            callback(null, chunk);
          },
        });
        const source = await provider.createReadStream(relativePath);
        try {
          await pipeline(source, counter, out);
        } catch {
          // premature close from the counter is expected — treat as done
        }
        const stat = await fs.stat(path).catch(() => null);
        if (stat && stat.size > 0) {
          return await work(path, null);
        }
        await fs.rm(path, { force: true });
      }

      const hash = createHash('sha256');
      const hashStream = new Transform({
        transform(chunk, _encoding, callback) {
          hash.update(chunk);
          callback(null, chunk);
        },
      });
      await pipeline(
        await provider.createReadStream(relativePath),
        hashStream,
        createWriteStream(path),
      );
      return await work(path, hash.digest('hex'));
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }

  async probe(path: string, relativePath: string): Promise<VideoMetadata> {
    const output = await runProcess('ffprobe', [
      '-v',
      'error',
      '-print_format',
      'json',
      '-show_format',
      '-show_streams',
      path,
    ]);
    const data = JSON.parse(output) as any;
    const stream = data.streams?.find((item: any) => item.codec_type === 'video');
    const streamDuration = Number(stream?.duration);
    const formatDuration = Number(data.format?.duration);
    const durationSeconds =
      Number.isFinite(streamDuration) && streamDuration > 0
        ? streamDuration
        : formatDuration;
    const sourceWidth = Number(stream?.width);
    const sourceHeight = Number(stream?.height);
    if (
      !stream ||
      !Number.isFinite(durationSeconds) ||
      durationSeconds <= 0 ||
      !Number.isFinite(sourceWidth) ||
      !Number.isFinite(sourceHeight)
    ) {
      throw new Error('Could not determine video metadata');
    }

    const rotation = Number(
      stream.tags?.rotate ??
        stream.side_data_list?.find((item: any) => item.rotation !== undefined)
          ?.rotation ??
        0,
    );
    const swapsDimensions = Math.abs(rotation) % 180 === 90;
    const width = swapsDimensions ? sourceHeight : sourceWidth;
    const height = swapsDimensions ? sourceWidth : sourceHeight;

    return {
      width,
      height,
      orientation:
        width === height ? 'square' : width > height ? 'landscape' : 'portrait',
      durationMs: Math.max(1, Math.round(durationSeconds * 1000)),
      mimeType: mimeTypeFor(relativePath),
      codec: typeof stream.codec_name === 'string' ? stream.codec_name : null,
      container:
        typeof data.format?.format_name === 'string'
          ? data.format.format_name
          : null,
    };
  }

  /**
   * Re-encodes a video for reliable, low-cost browser playback. The output
   * is always capped at 1080p / 30fps regardless of the source — a slideshow
   * gains nothing from 60fps or 4K, but both multiply the client's decode
   * load and are the usual cause of stutter on weaker display hardware.
   *
   * When a segment (startOffsetMs + durationMs) is given, only that slice is
   * extracted instead of transcoding the whole file — for a 1-hour source
   * shown for 20s this turns a ~15-minute encode into a few seconds. The
   * seek is accurate (placed after -i), so the cut starts exactly on
   * startOffsetMs even mid-GOP.
   */
  async normalize(
    inputPath: string,
    outputPath: string,
    segment?: { startOffsetMs: number; durationMs: number },
  ): Promise<void> {
    const seekArgs =
      segment && segment.durationMs > 0
        ? ['-ss', (segment.startOffsetMs / 1000).toFixed(3), '-t', (segment.durationMs / 1000).toFixed(3)]
        : [];
    await transcodeLimiter(() =>
      runProcess('ffmpeg', [
        '-y',
        '-v',
        'error',
        '-i',
        inputPath,
        ...seekArgs,
        '-map',
        '0:v:0',
        '-an',
        '-vf',
        // Cap the long edge at 1920px (downscale only, never upscale) and
        // keep dimensions even for libx264/yuv420p.
        "scale='if(gt(iw,ih),min(iw,1920),-2)':'if(gt(iw,ih),-2,min(ih,1920))':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
        '-r',
        '30',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '23',
        '-pix_fmt',
        'yuv420p',
        '-movflags',
        '+faststart',
        outputPath,
      ]),
    );
  }
}

export function mimeTypeFor(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.mp4':
    case '.m4v':
      return 'video/mp4';
    case '.mov':
      return 'video/quicktime';
    case '.webm':
      return 'video/webm';
    case '.mkv':
      return 'video/x-matroska';
    case '.avi':
      return 'video/x-msvideo';
    default:
      return 'application/octet-stream';
  }
}

function runProcess(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.once('error', (error) => reject(error));
    child.once('close', (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `${command} exited with code ${code}`));
    });
  });
}

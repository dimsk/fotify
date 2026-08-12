import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { createWriteStream, promises as fs } from 'fs';
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
  async withMaterializedFile<T>(
    provider: FileProvider,
    relativePath: string,
    work: (path: string, hash: string) => Promise<T>,
  ): Promise<T> {
    const dir = await fs.mkdtemp(join(tmpdir(), 'fotify-video-'));
    const path = join(dir, `source${extname(relativePath).toLowerCase()}`);
    const hash = createHash('sha256');
    const hashStream = new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    });

    try {
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

  async normalize(inputPath: string, outputPath: string): Promise<void> {
    await transcodeLimiter(() =>
      runProcess('ffmpeg', [
        '-y',
        '-v',
        'error',
        '-i',
        inputPath,
        '-map',
        '0:v:0',
        '-an',
        '-vf',
        'scale=trunc(iw/2)*2:trunc(ih/2)*2',
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

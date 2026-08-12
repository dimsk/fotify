import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { tmpdir } from 'os';
import { extname, join } from 'path';
import { spawn } from 'child_process';
import { Readable, Transform } from 'stream';
import { pipeline } from 'stream/promises';
import pLimit from 'p-limit';
import { FileProvider } from '../file-providers/file-provider.interface';
import { LocalFileProvider } from '../file-providers/local-file-provider';
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

const TEMP_PREFIX = 'fotify-video-';
/** Temp dirs from scans killed mid-flight (crash, restart) are fair game after this. */
const STALE_TEMP_AGE_MS = 60 * 60 * 1000;

@Injectable()
export class VideoProcessingService {
  private readonly logger = new Logger(VideoProcessingService.name);

  /**
   * Hands `work` a local file path for the given source file plus the file's
   * SHA-256 hash. Only needed by the `normalize` compatibility path, where
   * ffmpeg requires a seekable local input:
   *
   * - Local sources are used straight from their original path — no copy.
   * - Network sources (SMB) are streamed into a temp directory that is
   *   deleted as soon as `work` settles — even when `work` throws. (Hard
   *   process kills can still leave a temp dir behind;
   *   {@link cleanStaleTempDirs} sweeps those.)
   *
   * Scanning does NOT go through here anymore — it hashes and probes via
   * streaming passes (see ScanService.importVideo).
   */
  async withMaterializedFile<T>(
    provider: FileProvider,
    relativePath: string,
    work: (path: string, hash: string) => Promise<T>,
  ): Promise<T> {
    if (provider instanceof LocalFileProvider) {
      const path = provider.resolvePath(relativePath);
      const hash = await this.hashStream(
        provider.createReadStream(relativePath),
      );
      return work(path, hash);
    }

    const dir = await fs.mkdtemp(join(tmpdir(), TEMP_PREFIX));
    const path = join(dir, `source${extname(relativePath).toLowerCase()}`);
    try {
      const hash = await this.hashStream(
        provider.createReadStream(relativePath),
        createWriteStream(path),
      );
      return await work(path, hash);
    } finally {
      await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * Removes temp dirs left behind by scans that never reached their cleanup
   * (process killed mid-scan). Called once on module init and defensive: only
   * dirs older than STALE_TEMP_AGE_MS are touched, so a concurrent active
   * scan is never disturbed.
   */
  async onModuleInit(): Promise<void> {
    await this.cleanStaleTempDirs();
  }

  private async cleanStaleTempDirs(): Promise<void> {
    let entries;
    try {
      entries = await fs.readdir(tmpdir(), { withFileTypes: true });
    } catch {
      return;
    }
    const cutoff = Date.now() - STALE_TEMP_AGE_MS;
    for (const entry of entries) {
      if (!entry.isDirectory() || !entry.name.startsWith(TEMP_PREFIX)) continue;
      const path = join(tmpdir(), entry.name);
      try {
        const stat = await fs.stat(path);
        if (stat.mtimeMs < cutoff) {
          await fs.rm(path, { recursive: true, force: true });
          this.logger.log(`Removed stale video temp dir ${entry.name}`);
        }
      } catch {
        // best effort — a dir that can't be stated/removed is left for the OS
      }
    }
  }

  /** SHA-256 over everything the readable yields, optionally teeing into a sink. */
  async hashStream(
    readable: Readable | Promise<Readable>,
    sink?: NodeJS.WritableStream,
  ): Promise<string> {
    const hash = createHash('sha256');
    const hashTap = new Transform({
      transform(chunk, _encoding, callback) {
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    // A Transform as pipeline's last stage stays in paused mode, so the
    // source stalls after its first buffered chunks (observed: reads freeze
    // at exactly 2×highWaterMark). Drain it explicitly so data keeps flowing.
    hashTap.resume();
    const source = await readable;
    if (sink) {
      await pipeline(source, hashTap, sink);
    } else {
      await pipeline(source, hashTap);
    }
    return hash.digest('hex');
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
    return this.parseProbeOutput(output, relativePath);
  }

  /**
   * ffprobe reading from stdin instead of a file path. Used for network
   * sources (SMB), where no local path exists: ffprobe only consumes as much
   * of the stream as it needs to find the metadata (usually the first MBs
   * for mp4/mov), so this avoids materializing the whole file just to probe
   * it. Formats whose index sits at the end of the file still stream the
   * whole thing through ffprobe — but nothing ever touches the disk.
   */
  async probeStream(
    readable: Readable,
    relativePath: string,
  ): Promise<VideoMetadata> {
    const output = await runProcess(
      'ffprobe',
      [
        '-v',
        'error',
        '-print_format',
        'json',
        '-show_format',
        '-show_streams',
        'pipe:0',
      ],
      readable,
    );
    return this.parseProbeOutput(output, relativePath);
  }

  private parseProbeOutput(output: string, relativePath: string): VideoMetadata {
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

function runProcess(
  command: string,
  args: string[],
  input?: Readable,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
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
    if (input) {
      // ffprobe stops reading once it has the metadata it needs and exits;
      // the resulting EPIPE on our writes is expected, not a failure.
      child.stdin.on('error', () => undefined);
      input.pipe(child.stdin);
    }
  });
}

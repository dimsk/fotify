import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { copyFile, rename, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { extname } from 'path';
import { Repository } from 'typeorm';
import { Photo } from '../photos/photo.entity';
import { Source } from '../sources/source.entity';
import { Settings, VideoCompatibilityMode } from '../settings/settings.entity';
import { DEFAULT_SETTINGS } from '../settings/settings-defaults';
import { FileProviderFactory } from '../file-providers/file-provider.factory';
import { CacheStorageService } from '../scan/cache-storage.service';
import {
  mimeTypeFor,
  VideoProcessingService,
} from './video-processing.service';
import { videoDisplayDuration } from '../photos/video-playback.util';

export interface CachedVideo {
  path: string;
  mimeType: string;
  mode: VideoCompatibilityMode;
}

/**
 * Identifies a short slice of a video to cache instead of the whole file.
 * Only used in 'normalize' mode: extracting the shown segment (a few
 * seconds) is dramatically cheaper than transcoding an hours-long source,
 * and the result is a small local clip — which is exactly what fixes
 * network-streaming stutter for long remote videos.
 */
export interface VideoSegmentSpec {
  startOffsetMs: number;
  durationMs: number;
}

const CACHE_TOUCH_INTERVAL_MS = 60_000;
// How much of the source to pull over the network when extracting a segment:
// the requested span plus a safety margin, converted to bytes at a generous
// assumed bitrate. Anything beyond the cut is never needed.
const SEGMENT_SOURCE_HEADROOM_MS = 5_000;
const ASSUMED_SOURCE_BYTES_PER_MS = 2_000; // ~16 Mbps, above typical sources

@Injectable()
export class VideoCacheService {
  private readonly logger = new Logger(VideoCacheService.name);
  private readonly inflight = new Map<string, Promise<CachedVideo>>();

  constructor(
    @InjectRepository(Photo) private readonly photoRepo: Repository<Photo>,
    @InjectRepository(Source) private readonly sourceRepo: Repository<Source>,
    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,
    private readonly fileProviderFactory: FileProviderFactory,
    private readonly cacheStorage: CacheStorageService,
    private readonly videoProcessing: VideoProcessingService,
  ) {}

  /**
   * The slice of a video that the slideshow will actually show, derived from
   * the current duration/random-segment settings. Centralized here so the
   * advance path, the lookahead prewarm, and the /display endpoint all
   * resolve to the exact same cached clip for the same slide.
   */
  async segmentFor(
    video: Photo,
    startOffsetMs: number,
  ): Promise<VideoSegmentSpec> {
    const settings = await this.settingsRepo.findOneBy({ id: 1 });
    const baseDuration =
      settings?.imageDurationMs ?? DEFAULT_SETTINGS.imageDurationMs!;
    const durationMode =
      settings?.videoDurationMode ?? DEFAULT_SETTINGS.videoDurationMode!;
    const maxDurationMs =
      settings?.videoMaxDurationMs ?? DEFAULT_SETTINGS.videoMaxDurationMs!;
    const randomSegment =
      settings?.videoRandomSegmentEnabled ??
      DEFAULT_SETTINGS.videoRandomSegmentEnabled!;
    const durationMs = videoDisplayDuration(
      durationMode,
      video.durationMs ?? baseDuration,
      baseDuration,
      maxDurationMs,
    );
    return {
      startOffsetMs: randomSegment ? startOffsetMs : 0,
      durationMs,
    };
  }

  async ensureCached(video: Photo, segment?: VideoSegmentSpec): Promise<CachedVideo> {
    if (video.mediaType !== 'video') throw new Error('Media is not a video');
    const settings = await this.settingsRepo.findOneBy({ id: 1 });
    const mode =
      settings?.videoCompatibilityMode ??
      DEFAULT_SETTINGS.videoCompatibilityMode!;
    // Segments are only materialized in normalize mode — direct modes stream
    // the original and never call this for playback. When no explicit segment
    // is given (e.g. the /display endpoint), default to the start of the clip
    // with the currently-configured duration so the served slice matches what
    // the slideshow prepared.
    const effectiveSegment =
      mode === 'normalize' ? segment ?? (await this.segmentFor(video, 0)) : undefined;
    const variant = this.variantFor(mode, effectiveSegment);
    if (
      video.cachedDisplayPath &&
      video.cachedVideoMode === variant &&
      existsSync(video.cachedDisplayPath)
    ) {
      if (
        !video.cachedAt ||
        Date.now() - video.cachedAt.getTime() >= CACHE_TOUCH_INTERVAL_MS
      ) {
        const cachedAt = new Date();
        await this.photoRepo.update(
          { id: video.id, fileHash: video.fileHash },
          { cachedAt },
        );
        video.cachedAt = cachedAt;
      }
      return {
        path: video.cachedDisplayPath,
        mimeType:
          mode === 'normalize'
            ? 'video/mp4'
            : (video.mimeType ?? mimeTypeFor(video.relativePath)),
        mode,
      };
    }


    const extension =
      mode === 'normalize'
        ? '.mp4'
        : extname(video.relativePath).toLowerCase() || '.mp4';
    const expectedPath = await this.cacheStorage.pathForHash(
      video.fileHash,
      extension,
      variant,
    );
    if (existsSync(expectedPath)) {
      const cachedAt = new Date();
      const result = await this.photoRepo.update(
        { id: video.id, fileHash: video.fileHash },
        {
          cachedDisplayPath: expectedPath,
          cachedVideoMode: variant,
          cachedAt,
        },
      );
      if (result.affected !== 1) {
        await this.cacheStorage.delete(expectedPath);
        throw new Error('Video was removed while reusing its cache');
      }
      video.cachedDisplayPath = expectedPath;
      video.cachedVideoMode = variant;
      video.cachedAt = cachedAt;
      return {
        path: expectedPath,
        mimeType:
          mode === 'normalize'
            ? 'video/mp4'
            : (video.mimeType ?? mimeTypeFor(video.relativePath)),
        mode,
      };
    }

    const key = `${video.id}:${variant}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const work = this.generate(video, mode, effectiveSegment).finally(() =>
      this.inflight.delete(key),
    );
    this.inflight.set(key, work);
    return work;
  }

  /**
   * Cache-file variant for a (mode, segment) pair. Whole-file normalize keeps
   * the plain mode name so existing caches stay valid; a segment gets a
   * distinct variant keyed on offset+duration so each shown slice is cached
   * separately (and reclaimed independently by the eviction sweep).
   */
  private variantFor(
    mode: VideoCompatibilityMode,
    segment?: VideoSegmentSpec,
  ): string {
    if (mode !== 'normalize' || !segment) return mode;
    return `${mode}-seg${Math.round(segment.startOffsetMs)}-${Math.round(segment.durationMs)}`;
  }

  private async generate(
    video: Photo,
    mode: VideoCompatibilityMode,
    segment?: VideoSegmentSpec,
  ): Promise<CachedVideo> {
    const source = await this.sourceRepo.findOneBy({ id: video.sourceId });
    if (!source) throw new Error(`Source ${video.sourceId} no longer exists`);

    const variant = this.variantFor(mode, segment);
    // Only fetch the head of the source when we're going to cut a short
    // segment out of it — hashing the full file would defeat the point.
    const maxBytes =
      mode === 'normalize' && segment
        ? (segment.startOffsetMs + segment.durationMs + SEGMENT_SOURCE_HEADROOM_MS) *
          ASSUMED_SOURCE_BYTES_PER_MS
        : undefined;

    const provider = this.fileProviderFactory.forSource(source);
    await provider.connect();
    try {
      return await this.videoProcessing.withMaterializedFile(
        provider,
        video.relativePath,
        async (inputPath, currentHash) => {
          // currentHash is null when only a truncated prefix was fetched.
          if (currentHash !== null && currentHash !== video.fileHash) {
            await this.photoRepo.update(video.id, {
              sourceFileSize: null,
              sourceModifiedAt: null,
            });
            throw new Error('Video changed since the last source scan');
          }
          const extension =
            mode === 'normalize'
              ? '.mp4'
              : extname(video.relativePath).toLowerCase() || '.mp4';
          const target = await this.cacheStorage.pathForHash(
            video.fileHash,
            extension,
            variant,
          );
          const temporaryTarget = `${target}.part${extension}`;
          try {
            if (mode === 'normalize') {
              await this.videoProcessing.normalize(
                inputPath,
                temporaryTarget,
                segment,
              );
            } else {
              await copyFile(inputPath, temporaryTarget);
            }
            await rename(temporaryTarget, target);
          } catch (error) {
            await rm(temporaryTarget, { force: true });
            throw error;
          }

          const latestSettings = await this.settingsRepo.findOneBy({ id: 1 });
          const latestMode =
            latestSettings?.videoCompatibilityMode ??
            DEFAULT_SETTINGS.videoCompatibilityMode!;
          if (latestMode !== mode) {
            await this.cacheStorage.delete(target);
            throw new Error('Video compatibility mode changed');
          }
          const result = await this.photoRepo.update(
            { id: video.id, fileHash: video.fileHash },
            {
              cachedDisplayPath: target,
              cachedVideoMode: variant,
              cachedAt: new Date(),
            },
          );
          if (result.affected !== 1) {
            await this.cacheStorage.delete(target);
            throw new Error('Video was removed while preparing its cache');
          }
          const previousPath = video.cachedDisplayPath;
          video.cachedDisplayPath = target;
          video.cachedVideoMode = variant;
          video.cachedAt = new Date();
          // A different slice (or a previous whole-file encode) of the same
          // video is now unreferenced — reclaim it. The eviction sweep is the
          // backstop; this just frees it promptly.
          if (previousPath && previousPath !== target) {
            await this.cacheStorage.delete(previousPath);
          }
          this.logger.debug(
            `Prepared video ${video.id} (${video.relativePath}) as ${variant}`,
          );
          return {
            path: target,
            mimeType:
              mode === 'normalize'
                ? 'video/mp4'
                : (video.mimeType ?? mimeTypeFor(video.relativePath)),
            mode,
          };
        },
        maxBytes,
      );
    } finally {
      await provider.disconnect().catch(() => undefined);
    }
  }
}

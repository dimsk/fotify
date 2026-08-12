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
  videoIdentityHash,
} from './video-processing.service';

export interface CachedVideo {
  path: string;
  mimeType: string;
  mode: VideoCompatibilityMode;
}

const CACHE_TOUCH_INTERVAL_MS = 60_000;

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

  async ensureCached(video: Photo): Promise<CachedVideo> {
    if (video.mediaType !== 'video') throw new Error('Media is not a video');
    const settings = await this.settingsRepo.findOneBy({ id: 1 });
    const mode =
      settings?.videoCompatibilityMode ??
      DEFAULT_SETTINGS.videoCompatibilityMode!;
    if (
      video.cachedDisplayPath &&
      video.cachedVideoMode === mode &&
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
      mode,
    );
    if (existsSync(expectedPath)) {
      const cachedAt = new Date();
      const result = await this.photoRepo.update(
        { id: video.id, fileHash: video.fileHash },
        {
          cachedDisplayPath: expectedPath,
          cachedVideoMode: mode,
          cachedAt,
        },
      );
      if (result.affected !== 1) {
        await this.cacheStorage.delete(expectedPath);
        throw new Error('Video was removed while reusing its cache');
      }
      video.cachedDisplayPath = expectedPath;
      video.cachedVideoMode = mode;
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

    const key = `${video.id}:${mode}`;
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const work = this.generate(video, mode).finally(() =>
      this.inflight.delete(key),
    );
    this.inflight.set(key, work);
    return work;
  }

  private async generate(
    video: Photo,
    mode: VideoCompatibilityMode,
  ): Promise<CachedVideo> {
    const source = await this.sourceRepo.findOneBy({ id: video.sourceId });
    if (!source) throw new Error(`Source ${video.sourceId} no longer exists`);

    const provider = this.fileProviderFactory.forSource(source);
    await provider.connect();
    try {
      return await this.videoProcessing.withMaterializedFile(
        provider,
        video.relativePath,
        async (inputPath, currentHash) => {
          // Videos are identified by size+mtime (see ScanService.importVideo),
          // so the content hash from withMaterializedFile can never match —
          // verify identity the same way the scan does instead.
          if (
            video.sourceFileSize !== null &&
            video.sourceModifiedAt !== null &&
            videoIdentityHash(video.sourceFileSize, video.sourceModifiedAt) ===
              video.fileHash
          ) {
            // unchanged — identity confirmed without reading the file
          } else if (currentHash !== video.fileHash) {
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
            mode,
          );
          const temporaryTarget = `${target}.part${extension}`;
          try {
            if (mode === 'normalize') {
              await this.videoProcessing.normalize(inputPath, temporaryTarget);
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
              cachedVideoMode: mode,
              cachedAt: new Date(),
            },
          );
          if (result.affected !== 1) {
            await this.cacheStorage.delete(target);
            throw new Error('Video was removed while preparing its cache');
          }
          video.cachedDisplayPath = target;
          video.cachedVideoMode = mode;
          video.cachedAt = new Date();
          if (video.cachedDisplayPath && video.cachedDisplayPath !== target) {
            await this.cacheStorage.delete(video.cachedDisplayPath);
          }
          this.logger.debug(
            `Prepared video ${video.id} (${video.relativePath}) as ${mode}`,
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
      );
    } finally {
      await provider.disconnect().catch(() => undefined);
    }
  }
}

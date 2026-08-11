import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { existsSync } from 'fs';
import sharp from 'sharp';
import convertHeicToJpeg from 'heic-convert';
import { Photo } from '../photos/photo.entity';
import { Source } from '../sources/source.entity';
import { FileProviderFactory } from '../file-providers/file-provider.factory';
import { CacheStorageService } from '../scan/cache-storage.service';
import { CACHE_JPEG_QUALITY, CACHE_MAX_DIMENSION } from './cache-image.constants';
import { cpuWorkLimiter } from '../common/cpu-work-limiter';

@Injectable()
export class PhotoCacheService {
  private readonly logger = new Logger(PhotoCacheService.name);
  private readonly inflight = new Map<number, Promise<string>>();

  constructor(
    @InjectRepository(Photo) private readonly photoRepo: Repository<Photo>,
    @InjectRepository(Source) private readonly sourceRepo: Repository<Source>,
    private readonly fileProviderFactory: FileProviderFactory,
    private readonly cacheStorage: CacheStorageService,
  ) {}

  /**
   * Returns an absolute path to a display-resolution JPEG for this photo,
   * generating it on demand (fetching the original from its source and
   * resizing it) if it doesn't already exist. Cache generation is
   * deliberately NOT done at scan/import time — it happens here, lazily,
   * whenever a photo is first requested (in practice, "requested" usually
   * means the slideshow's deep lookahead queue warmed it a few minutes
   * before it's actually due to be shown, not the display request itself).
   */
  async ensureCached(photo: Photo): Promise<string> {
    if (photo.mediaType !== 'image') throw new Error('Media is not an image');
    if (photo.cachedDisplayPath && existsSync(photo.cachedDisplayPath)) {
      return photo.cachedDisplayPath;
    }

    // Coalesce concurrent requests for the same not-yet-cached photo (e.g. a
    // warm-fetch and a real display request landing at nearly the same
    // time) into a single generation instead of racing two sharp runs.
    const existingWork = this.inflight.get(photo.id);
    if (existingWork) {
      return existingWork;
    }

    const work = this.generate(photo).finally(() => this.inflight.delete(photo.id));
    this.inflight.set(photo.id, work);
    return work;
  }

  private async generate(photo: Photo): Promise<string> {
    const source = await this.sourceRepo.findOneBy({ id: photo.sourceId });
    if (!source) {
      throw new Error(`Source ${photo.sourceId} no longer exists`);
    }

    const provider = this.fileProviderFactory.forSource(source);
    await provider.connect();
    let buffer: Buffer;
    try {
      buffer = await provider.readFile(photo.relativePath);
    } finally {
      await provider.disconnect().catch(() => undefined);
    }

    const cachedDisplayPath = await this.cacheStorage.pathForHash(photo.fileHash);
    // The resize/encode itself is the CPU-heavy part — bounded by a shared,
    // app-wide limiter (see cpuWorkLimiter) so a burst of concurrent
    // warm-fetches from the slideshow's lookahead queue can't spike CPU.
    // The (potentially slow, e.g. over SMB) file read above stays outside
    // the limiter so it doesn't hold up that budget while waiting on I/O.
    await cpuWorkLimiter(async () => {
      const pipeline = (input: Buffer | string) =>
        sharp(input)
          .rotate()
          .resize(CACHE_MAX_DIMENSION, CACHE_MAX_DIMENSION, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: CACHE_JPEG_QUALITY });
      try {
        await pipeline(buffer).toFile(cachedDisplayPath);
      } catch (error) {
        // iPhone multi-image HEICs (Live Photos, depth maps) fail libheif's
        // bundled decode in two ways: the iref security limit (recoverable
        // via `unlimited`), and a `bad seek` decoder regression in the
        // bundled libheif 1.23.x (not recoverable via sharp options).
        // heic-convert ships libheif 1.19 as WASM — decodes them fine, runs
        // inside the Docker image with no system packages.
        const message = (error as Error).message;
        if (!/heif|bad seek|corrupt header|security limit/i.test(message)) {
          throw error;
        }
        this.logger.log(
          `sharp could not decode ${photo.relativePath} (${message.slice(0, 60)}) — falling back to heic-convert`,
        );
        const decoded = await convertHeicToJpeg(buffer);
        await pipeline(decoded).toFile(cachedDisplayPath);
      }
    });

    photo.cachedDisplayPath = cachedDisplayPath;
    photo.cachedAt = new Date();
    await this.photoRepo.save(photo);
    this.logger.debug(`Generated cache for photo ${photo.id} (${photo.relativePath})`);

    return cachedDisplayPath;
  }
}

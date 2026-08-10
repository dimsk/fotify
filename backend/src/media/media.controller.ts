import {
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  Param,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createReadStream, promises as fs } from 'fs';
import { basename, extname } from 'path';
import type { Response } from 'express';
import { Photo } from '../photos/photo.entity';
import { PhotoAction } from '../photos/photo-action.entity';
import { Settings } from '../settings/settings.entity';
import { Source } from '../sources/source.entity';
import { PhotoCacheService } from './photo-cache.service';
import { VideoCacheService } from './video-cache.service';
import { FileProviderFactory } from '../file-providers/file-provider.factory';
import { mimeTypeFor } from './video-processing.service';
import { DEFAULT_SETTINGS } from '../settings/settings-defaults';

@Controller('photos')
export class MediaController {
  constructor(
    @InjectRepository(Photo) private readonly photoRepo: Repository<Photo>,
    @InjectRepository(PhotoAction)
    private readonly photoActionRepo: Repository<PhotoAction>,
    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,
    @InjectRepository(Source) private readonly sourceRepo: Repository<Source>,
    private readonly photoCacheService: PhotoCacheService,
    private readonly videoCacheService: VideoCacheService,
    private readonly fileProviderFactory: FileProviderFactory,
  ) {}

  @Get(':id/display')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async display(
    @Param('id', ParseIntPipe) id: number,
    @Headers('range') range: string | undefined,
    @Res() res: Response,
  ) {
    const photo = await this.photoRepo.findOneBy({ id });
    if (!photo) {
      throw new NotFoundException('Photo not found');
    }

    if (photo.mediaType === 'video') {
      const settings = await this.settingsRepo.findOneBy({ id: 1 });
      const mode =
        settings?.videoCompatibilityMode ??
        DEFAULT_SETTINGS.videoCompatibilityMode!;
      if (mode !== 'normalize') {
        // Direct play: stream the original file straight from its source —
        // no cache copy, no conversion, so playback starts with the first
        // bytes instead of after a full server-side preprocessing pass.
        try {
          return await this.streamVideoFromSource(photo, range, res);
        } catch {
          throw new NotFoundException('Video not found');
        }
      }
      try {
        const cached = await this.videoCacheService.ensureCached(photo);
        res.setHeader('ETag', `"${photo.fileHash}-${cached.mode}"`);
        res.setHeader('Cache-Control', 'no-cache');
        return this.streamVideo(cached.path, cached.mimeType, range, res);
      } catch {
        throw new NotFoundException('Video not found');
      }
    }

    let path: string;
    try {
      path = await this.photoCacheService.ensureCached(photo);
    } catch {
      throw new NotFoundException('Photo not found');
    }

    res.setHeader('ETag', photo.fileHash);
    res.setHeader('Content-Type', 'image/jpeg');
    createReadStream(path).pipe(res);
  }

  @Get(':id/download')
  async download(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const photo = await this.photoRepo.findOneBy({ id });
    if (!photo) {
      throw new NotFoundException('Photo not found');
    }

    if (photo.mediaType === 'video') {
      let cached: Awaited<ReturnType<VideoCacheService['ensureCached']>>;
      try {
        cached = await this.videoCacheService.ensureCached(photo);
      } catch {
        throw new NotFoundException('Video not found');
      }
      await this.recordDownload(id);
      const originalName = basename(photo.relativePath).replace(/"/g, '');
      const cachedExtension = extname(cached.path);
      const filename = originalName.replace(/\.[^.]+$/, cachedExtension);
      res.setHeader('Content-Type', cached.mimeType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename}"`,
      );
      return createReadStream(cached.path).pipe(res);
    }

    let path: string;
    try {
      path = await this.photoCacheService.ensureCached(photo);
    } catch {
      throw new NotFoundException('Photo not found');
    }

    await this.recordDownload(id);
    const filename = basename(photo.relativePath).replace(/\.[^.]+$/, '.jpg');
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename.replace(/"/g, '')}"`,
    );
    createReadStream(path).pipe(res);
  }

  /**
   * Streams the untouched original file from its source (local disk or SMB
   * share) with no cache copy and no conversion, so playback starts with
   * the first bytes. Providers support positioned reads, so HTTP range
   * requests (browser video seeks) start at the requested offset instead
   * of transferring and discarding the skipped prefix.
   */
  private async streamVideoFromSource(
    photo: Photo,
    range: string | undefined,
    res: Response,
  ): Promise<void> {
    const source = await this.sourceRepo.findOneBy({ id: photo.sourceId });
    if (!source) throw new NotFoundException('Source not found');
    const provider = this.fileProviderFactory.forSource(source);
    await provider.connect();
    const disconnect = () => provider.disconnect().catch(() => undefined);
    try {
      const size = await provider.getFileSize(photo.relativePath);
      const mimeType = photo.mimeType ?? mimeTypeFor(photo.relativePath);
      res.setHeader('ETag', `"${photo.fileHash}-direct"`);
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', mimeType);

      let start = 0;
      let end = size - 1;
      if (range) {
        const parsed = parseByteRange(range, size);
        if (!parsed) {
          res.status(416);
          res.setHeader('Content-Range', `bytes */${size}`);
          res.end();
          await disconnect();
          return;
        }
        ({ start, end } = parsed);
        res.status(206);
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      }
      res.setHeader('Content-Length', end - start + 1);

      const stream = await provider.createReadStream(photo.relativePath, {
        start,
        end,
      });
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        stream.destroy();
        void disconnect();
      };
      res.on('close', close);
      stream.on('error', close);
      stream.pipe(res);
    } catch (error) {
      await disconnect();
      throw error;
    }
  }

  private async streamVideo(
    path: string,
    mimeType: string,
    range: string | undefined,
    res: Response,
  ) {
    const { size } = await fs.stat(path);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', mimeType);
    if (!range) {
      res.setHeader('Content-Length', size);
      return createReadStream(path).pipe(res);
    }

    const parsed = parseByteRange(range, size);
    if (!parsed) {
      res.status(416);
      res.setHeader('Content-Range', `bytes */${size}`);
      return res.end();
    }
    const { start, end } = parsed;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
    res.setHeader('Content-Length', end - start + 1);
    return createReadStream(path, { start, end }).pipe(res);
  }

  private async recordDownload(photoId: number): Promise<void> {
    const action =
      (await this.photoActionRepo.findOneBy({ photoId })) ??
      this.photoActionRepo.create({ photoId });
    action.downloadCount = (action.downloadCount ?? 0) + 1;
    action.lastDownloadedAt = new Date();
    await this.photoActionRepo.save(action);
  }
}

export function parseByteRange(
  value: string,
  size: number,
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match) return null;
  let start: number;
  let end: number;
  if (match[1] === '') {
    const suffixLength = Number(match[2]);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === '' ? size - 1 : Number(match[2]);
  }
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return null;
  }
  return { start, end: Math.min(end, size - 1) };
}

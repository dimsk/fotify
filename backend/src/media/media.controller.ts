import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
  Res,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createReadStream } from 'fs';
import { basename } from 'path';
import type { Response } from 'express';
import { Photo } from '../photos/photo.entity';
import { PhotoAction } from '../photos/photo-action.entity';
import { PhotoCacheService } from './photo-cache.service';

@Controller('photos')
export class MediaController {
  constructor(
    @InjectRepository(Photo) private readonly photoRepo: Repository<Photo>,
    @InjectRepository(PhotoAction)
    private readonly photoActionRepo: Repository<PhotoAction>,
    private readonly photoCacheService: PhotoCacheService,
  ) {}

  @Get(':id/display')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async display(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const photo = await this.photoRepo.findOneBy({ id });
    if (!photo) {
      throw new NotFoundException('Photo not found');
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

  private async recordDownload(photoId: number): Promise<void> {
    const action =
      (await this.photoActionRepo.findOneBy({ photoId })) ??
      this.photoActionRepo.create({ photoId });
    action.downloadCount = (action.downloadCount ?? 0) + 1;
    action.lastDownloadedAt = new Date();
    await this.photoActionRepo.save(action);
  }
}

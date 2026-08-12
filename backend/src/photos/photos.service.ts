import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Not, Repository } from 'typeorm';
import { Photo } from './photo.entity';
import { PhotoAction } from './photo-action.entity';
import { CollageLayoutType } from '../settings/settings.entity';
import { notifyPhotosDeleted } from '../common/photo-deletion.notifier';

export interface SlidePhoto {
  id: number;
  url: string;
  mediaType: 'image' | 'video';
  width: number;
  height: number;
  durationMs: number | null;
  mimeType: string | null;
  orientation: string;
  capturedAt: string | null;
  locationCity: string | null;
  locationCountry: string | null;
  lens: string | null;
  aperture: number | null;
}

export type SlidePlan =
  | { type: 'single'; photos: [SlidePhoto] }
  | { type: 'triple'; photos: [SlidePhoto, SlidePhoto, SlidePhoto] }
  | { type: 'collage'; photos: SlidePhoto[]; layout: CollageLayoutType }
  | { type: 'empty'; photos: [] };

export interface RecentMedia {
  id: number;
  mediaType: 'image' | 'video';
  width: number;
  height: number;
  orientation: string;
  capturedAt: string | null;
  lastShownAt: string;
  relativePath: string;
  locationCity: string | null;
  locationCountry: string | null;
}

@Injectable()
export class PhotosService {
  constructor(
    @InjectRepository(Photo) private readonly photoRepo: Repository<Photo>,
    @InjectRepository(PhotoAction)
    private readonly photoActionRepo: Repository<PhotoAction>,
  ) {}

  async stats() {
    const [total, portrait, landscape, square] = await Promise.all([
      this.photoRepo.count(),
      this.photoRepo.countBy({ mediaType: 'image', orientation: 'portrait' }),
      this.photoRepo.countBy({ mediaType: 'image', orientation: 'landscape' }),
      this.photoRepo.countBy({ mediaType: 'image', orientation: 'square' }),
    ]);
    return { total, portrait, landscape, square };
  }

  async countBySource(sourceId: number): Promise<number> {
    return this.photoRepo.countBy({ sourceId });
  }

  async getActionState(photoId: number) {
    await this.requirePhoto(photoId);
    const action = await this.photoActionRepo.findOneBy({ photoId });
    return {
      photoId,
      favorited: Boolean(action?.favoritedAt),
      hidden: Boolean(action?.hiddenAt),
      downloadCount: action?.downloadCount ?? 0,
    };
  }

  /**
   * The most recently shown photos/videos (by lastShownAt), newest first —
   * powers the "recently shown" admin page. Collage/triple slides stamp the
   * same timestamp on every photo in the slide, so they naturally group
   * together here.
   */
  async recentlyShown(limit = 50): Promise<RecentMedia[]> {
    const photos = await this.photoRepo.find({
      where: { lastShownAt: Not(IsNull()) },
      order: { lastShownAt: 'DESC' },
      take: limit,
    });
    return photos.map((photo) => ({
      id: photo.id,
      mediaType: photo.mediaType,
      width: photo.width,
      height: photo.height,
      orientation: photo.orientation,
      capturedAt: photo.capturedAt ? photo.capturedAt.toISOString() : null,
      lastShownAt: photo.lastShownAt!.toISOString(),
      relativePath: photo.relativePath,
      locationCity: photo.locationCity,
      locationCountry: photo.locationCountry,
    }));
  }

  async favorite(photoId: number) {
    await this.requirePhoto(photoId);
    const action = await this.actionFor(photoId);
    if (!action.favoritedAt) {
      action.favoritedAt = new Date();
      await this.photoActionRepo.save(action);
    }
    return this.getActionState(photoId);
  }

  async hide(photoId: number) {
    await this.requirePhoto(photoId);
    const action = await this.actionFor(photoId);
    if (!action.hiddenAt) {
      action.hiddenAt = new Date();
      await this.photoActionRepo.save(action);
      notifyPhotosDeleted([photoId]);
    }
    return this.getActionState(photoId);
  }

  private async actionFor(photoId: number): Promise<PhotoAction> {
    const existing = await this.photoActionRepo.findOneBy({ photoId });
    return existing ?? this.photoActionRepo.create({ photoId });
  }

  private async requirePhoto(photoId: number): Promise<Photo> {
    const photo = await this.photoRepo.findOneBy({ id: photoId });
    if (!photo) {
      throw new NotFoundException('Photo not found');
    }
    return photo;
  }
}

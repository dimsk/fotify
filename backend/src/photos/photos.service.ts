import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Photo } from './photo.entity';
import { PhotoAction } from './photo-action.entity';
import { CollageLayoutType } from '../settings/settings.entity';
import { notifyPhotosDeleted } from '../common/photo-deletion.notifier';

export interface SlidePhoto {
  id: number;
  url: string;
  width: number;
  height: number;
  orientation: string;
  capturedAt: string | null;
  locationCity: string | null;
  locationCountry: string | null;
}

export type SlidePlan =
  | { type: 'single'; photos: [SlidePhoto] }
  | { type: 'triple'; photos: [SlidePhoto, SlidePhoto, SlidePhoto] }
  | { type: 'collage'; photos: SlidePhoto[]; layout: CollageLayoutType }
  | { type: 'empty'; photos: [] };

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
      this.photoRepo.countBy({ orientation: 'portrait' }),
      this.photoRepo.countBy({ orientation: 'landscape' }),
      this.photoRepo.countBy({ orientation: 'square' }),
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

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Photo } from './photo.entity';
import { PhotoAction } from './photo-action.entity';
import { Settings } from '../settings/settings.entity';
import { Source } from '../sources/source.entity';
import { QueuedSlide } from './queued-slide.entity';
import { MediaModule } from '../media/media.module';
import { ScanModule } from '../scan/scan.module';
import { PhotosService } from './photos.service';
import { PhotosController } from './photos.controller';
import { SlideshowStateService } from './slideshow-state.service';
import { StatisticsService } from './statistics.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Photo,
      PhotoAction,
      Settings,
      Source,
      QueuedSlide,
    ]),
    MediaModule,
    ScanModule,
  ],
  controllers: [PhotosController],
  providers: [PhotosService, SlideshowStateService, StatisticsService],
  exports: [PhotosService],
})
export class PhotosModule {}

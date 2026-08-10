import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Source } from '../sources/source.entity';
import { Photo } from '../photos/photo.entity';
import { QueuedSlide } from '../photos/queued-slide.entity';
import { Settings } from '../settings/settings.entity';
import { FileProvidersModule } from '../file-providers/file-providers.module';
import { ScanService } from './scan.service';
import { ScanController } from './scan.controller';
import { CacheStorageService } from './cache-storage.service';
import { OrphanCacheCleanupService } from './orphan-cache-cleanup.service';
import { AutoRescanService } from './auto-rescan.service';
import { GeocodingService } from './geocoding.service';
import { VideoProcessingService } from '../media/video-processing.service';

@Module({
  imports: [TypeOrmModule.forFeature([Source, Photo, Settings, QueuedSlide]), FileProvidersModule],
  controllers: [ScanController],
  providers: [ScanService, CacheStorageService, OrphanCacheCleanupService, AutoRescanService, GeocodingService, VideoProcessingService],
  exports: [ScanService, CacheStorageService, VideoProcessingService],
})
export class ScanModule {}

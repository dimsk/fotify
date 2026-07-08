import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Photo } from '../photos/photo.entity';
import { PhotoAction } from '../photos/photo-action.entity';
import { Source } from '../sources/source.entity';
import { FileProvidersModule } from '../file-providers/file-providers.module';
import { ScanModule } from '../scan/scan.module';
import { MediaController } from './media.controller';
import { PhotoCacheService } from './photo-cache.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Photo, PhotoAction, Source]),
    FileProvidersModule,
    ScanModule,
  ],
  controllers: [MediaController],
  providers: [PhotoCacheService],
  exports: [PhotoCacheService],
})
export class MediaModule {}

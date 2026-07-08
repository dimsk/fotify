import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Source } from './source.entity';
import { Photo } from '../photos/photo.entity';
import { ScanModule } from '../scan/scan.module';
import { FileProvidersModule } from '../file-providers/file-providers.module';
import { SourcesService } from './sources.service';
import { SourcesController } from './sources.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Source, Photo]), ScanModule, FileProvidersModule],
  controllers: [SourcesController],
  providers: [SourcesService],
})
export class SourcesModule {}

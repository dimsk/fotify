import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Photo } from './photo.entity';
import { Source } from '../sources/source.entity';
import { CacheStorageService } from '../scan/cache-storage.service';

export interface SourceStatistic {
  id: number;
  name: string;
  type: 'local' | 'smb';
  photoCount: number;
  shownCount: number;
}

export interface Statistics {
  totalPhotos: number;
  totalSources: number;
  byOrientation: { portrait: number; landscape: number; square: number };
  shownCount: number;
  neverShownCount: number;
  photosWithGpsCoordinates: number;
  photosWithoutGpsCoordinates: number;
  cache: { fileCount: number; totalBytes: number };
  oldestCapturedAt: string | null;
  newestCapturedAt: string | null;
  photosNeedingLocationBackfill: number;
  photosNeedingLensApertureBackfill: number;
  sources: SourceStatistic[];
}

interface PhotoStatisticRow {
  total: number | string | null;
  portrait: number | string | null;
  landscape: number | string | null;
  square: number | string | null;
  shown: number | string | null;
  oldest: string | null;
  newest: string | null;
  needingLocationBackfill: number | string | null;
  withGpsCoordinates: number | string | null;
  needingLensApertureBackfill: number | string | null;
}

interface SourceStatisticRow {
  id: number;
  name: string;
  type: 'local' | 'smb';
  photoCount: number | string | null;
  shownCount: number | string | null;
}

@Injectable()
export class StatisticsService {
  constructor(
    @InjectRepository(Photo) private readonly photoRepo: Repository<Photo>,
    @InjectRepository(Source) private readonly sourceRepo: Repository<Source>,
    private readonly cacheStorage: CacheStorageService,
  ) {}

  async getStatistics(): Promise<Statistics> {
    const [photoStats, sourceStats, cache] = await Promise.all([
      this.getPhotoStatistics(),
      this.getSourceStatistics(),
      this.cacheStorage.getDirStats(),
    ]);

    const total = toNumber(photoStats.total);
    const shown = toNumber(photoStats.shown);
    const withGpsCoordinates = toNumber(photoStats.withGpsCoordinates);

    return {
      totalPhotos: total,
      totalSources: sourceStats.length,
      byOrientation: {
        portrait: toNumber(photoStats.portrait),
        landscape: toNumber(photoStats.landscape),
        square: toNumber(photoStats.square),
      },
      shownCount: shown,
      neverShownCount: total - shown,
      photosWithGpsCoordinates: withGpsCoordinates,
      photosWithoutGpsCoordinates: total - withGpsCoordinates,
      cache,
      oldestCapturedAt: photoStats.oldest ?? null,
      newestCapturedAt: photoStats.newest ?? null,
      photosNeedingLocationBackfill: toNumber(
        photoStats.needingLocationBackfill,
      ),
      photosNeedingLensApertureBackfill: toNumber(
        photoStats.needingLensApertureBackfill,
      ),
      sources: sourceStats,
    };
  }

  private async getPhotoStatistics(): Promise<PhotoStatisticRow> {
    const row = await this.photoRepo
      .createQueryBuilder('photo')
      .select('COUNT(*)', 'total')
      .addSelect(
        `SUM(CASE WHEN photo.orientation = 'portrait' THEN 1 ELSE 0 END)`,
        'portrait',
      )
      .addSelect(
        `SUM(CASE WHEN photo.orientation = 'landscape' THEN 1 ELSE 0 END)`,
        'landscape',
      )
      .addSelect(
        `SUM(CASE WHEN photo.orientation = 'square' THEN 1 ELSE 0 END)`,
        'square',
      )
      .addSelect(
        'SUM(CASE WHEN photo.lastShownAt IS NOT NULL THEN 1 ELSE 0 END)',
        'shown',
      )
      .addSelect('MIN(photo.capturedAt)', 'oldest')
      .addSelect('MAX(photo.capturedAt)', 'newest')
      .addSelect(
        'SUM(CASE WHEN photo.locationScanned = 0 THEN 1 ELSE 0 END)',
        'needingLocationBackfill',
      )
      .addSelect(
        'SUM(CASE WHEN photo.gpsLatitude IS NOT NULL AND photo.gpsLongitude IS NOT NULL THEN 1 ELSE 0 END)',
        'withGpsCoordinates',
      )
      .addSelect(
        'SUM(CASE WHEN photo.lensApertureScanned = 0 THEN 1 ELSE 0 END)',
        'needingLensApertureBackfill',
      )
      .getRawOne<PhotoStatisticRow>();

    return (
      row ?? {
        total: 0,
        portrait: 0,
        landscape: 0,
        square: 0,
        shown: 0,
        oldest: null,
        newest: null,
        needingLocationBackfill: 0,
        withGpsCoordinates: 0,
        needingLensApertureBackfill: 0,
      }
    );
  }

  private async getSourceStatistics(): Promise<SourceStatistic[]> {
    const rows = await this.sourceRepo
      .createQueryBuilder('source')
      .leftJoin(Photo, 'photo', 'photo.sourceId = source.id')
      .select('source.id', 'id')
      .addSelect('source.name', 'name')
      .addSelect('source.type', 'type')
      .addSelect('COUNT(photo.id)', 'photoCount')
      .addSelect(
        'SUM(CASE WHEN photo.lastShownAt IS NOT NULL THEN 1 ELSE 0 END)',
        'shownCount',
      )
      .groupBy('source.id')
      .addGroupBy('source.name')
      .addGroupBy('source.type')
      .orderBy('source.createdAt', 'DESC')
      .getRawMany<SourceStatisticRow>();

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      photoCount: toNumber(row.photoCount),
      shownCount: toNumber(row.shownCount),
    }));
  }
}

function toNumber(value: number | string | null | undefined): number {
  return Number(value ?? 0);
}

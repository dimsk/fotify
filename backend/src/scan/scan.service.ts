import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject, Observable, of } from 'rxjs';
import { createHash } from 'crypto';
import sharp from 'sharp';
import * as exifr from 'exifr';
import pLimit from 'p-limit';
import { Source } from '../sources/source.entity';
import { Photo } from '../photos/photo.entity';
import { FileProvider } from '../file-providers/file-provider.interface';
import { FileProviderFactory } from '../file-providers/file-provider.factory';
import { CacheStorageService } from './cache-storage.service';
import { GeocodingService } from './geocoding.service';
import { walkImageFiles } from './directory-walker';
import { computeDisplayDimensions } from './exif-orientation.util';
import { cpuWorkLimiter } from '../common/cpu-work-limiter';
import { notifyPhotosDeleted } from '../common/photo-deletion.notifier';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif']);
const SCAN_CONCURRENCY = 6;

export interface ScanProgressEvent {
  status: 'scanning' | 'backfilling_locations' | 'idle' | 'error';
  processed: number;
  total: number;
  currentFile?: string;
  error?: string;
}

@Injectable()
export class ScanService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScanService.name);
  private readonly progressSubjects = new Map<
    number,
    Subject<ScanProgressEvent>
  >();
  private readonly activeScans = new Set<number>();
  private readonly activeLocationBackfills = new Set<number>();

  constructor(
    @InjectRepository(Source) private readonly sourceRepo: Repository<Source>,
    @InjectRepository(Photo) private readonly photoRepo: Repository<Photo>,
    private readonly fileProviderFactory: FileProviderFactory,
    private readonly cacheStorage: CacheStorageService,
    private readonly geocodingService: GeocodingService,
  ) {}

  /**
   * A source can be left stuck in status="scanning" if the process died
   * mid-scan (crash, redeploy, restart). The scan itself is idempotent —
   * already-imported unchanged files are skipped cheaply — so simply
   * re-triggering it is a safe and simple way to "resume" without needing
   * per-file checkpoint tracking.
   */
  async onApplicationBootstrap(): Promise<void> {
    const stuck = await this.sourceRepo.find({ where: { status: 'scanning' } });
    for (const source of stuck) {
      this.logger.log(
        `Resuming interrupted scan for source ${source.id} (${source.name})`,
      );
      this.triggerScan(source.id);
    }
  }

  async progress$(sourceId: number): Promise<Observable<ScanProgressEvent>> {
    if (
      this.activeScans.has(sourceId) ||
      this.activeLocationBackfills.has(sourceId)
    ) {
      return this.subjectFor(sourceId).asObservable();
    }
    // No scan currently running (already finished, or never started for this
    // connection) — emit the source's current status once and close, rather
    // than opening a stream that would otherwise hang forever with no events.
    const source = await this.sourceRepo.findOneBy({ id: sourceId });
    return of<ScanProgressEvent>({
      status: source?.status ?? 'idle',
      processed: 0,
      total: 0,
      error: source?.lastScanError ?? undefined,
    });
  }

  /** Fire-and-forget: caller does not await scan completion. */
  triggerScan(sourceId: number): void {
    this.scanSource(sourceId).catch((err) => {
      this.logger.error(`Scan of source ${sourceId} failed`, err);
    });
  }

  async scanSource(sourceId: number): Promise<void> {
    if (this.activeScans.has(sourceId)) {
      return;
    }
    this.activeScans.add(sourceId);

    const source = await this.sourceRepo.findOneBy({ id: sourceId });
    if (!source) {
      this.activeScans.delete(sourceId);
      return;
    }

    const subject = this.subjectFor(sourceId);
    source.status = 'scanning';
    source.lastScanError = null;
    await this.sourceRepo.save(source);
    subject.next({ status: 'scanning', processed: 0, total: 0 });

    const provider = this.fileProviderFactory.forSource(source);

    try {
      await provider.connect();
      const filePaths = await walkImageFiles(provider, IMAGE_EXTENSIONS);

      const existingPhotos = await this.photoRepo.find({ where: { sourceId } });
      // Keyed by relativePath (a file's stable identity within a source) so
      // we can tell "unchanged", "content changed at this path", and "path
      // no longer exists" apart. Entries get claimed (deleted from this map)
      // as matching current files are processed below; whatever remains
      // afterwards is stale — its source file was deleted or moved since
      // the last scan — and gets pruned along with its cache file.
      const existingByPath = new Map(
        existingPhotos.map((p) => [p.relativePath, p]),
      );
      const seenHashes = new Set(existingPhotos.map((p) => p.fileHash));

      let processed = 0;
      const limit = pLimit(SCAN_CONCURRENCY);
      subject.next({
        status: 'scanning',
        processed: 0,
        total: filePaths.length,
      });

      await Promise.all(
        filePaths.map((relativePath) =>
          limit(async () => {
            try {
              await this.importFile(
                provider,
                source,
                relativePath,
                existingByPath,
                seenHashes,
              );
            } catch (err) {
              this.logger.warn(
                `Failed to import ${relativePath}: ${(err as Error).message}`,
              );
            } finally {
              processed += 1;
              subject.next({
                status: 'scanning',
                processed,
                total: filePaths.length,
                currentFile: relativePath,
              });
            }
          }),
        ),
      );

      const stalePhotos = [...existingByPath.values()];
      if (stalePhotos.length > 0) {
        await this.photoRepo.remove(stalePhotos);
        notifyPhotosDeleted(stalePhotos.map((p) => p.id));
        await Promise.all(
          stalePhotos.map((p) => this.cacheStorage.delete(p.cachedDisplayPath)),
        );
      }

      source.status = 'idle';
      await this.sourceRepo.save(source);
      subject.next({
        status: 'idle',
        processed: filePaths.length,
        total: filePaths.length,
      });
    } catch (err) {
      const message = (err as Error).message;
      source.status = 'error';
      source.lastScanError = message;
      await this.sourceRepo.save(source);
      subject.next({ status: 'error', processed: 0, total: 0, error: message });
    } finally {
      await provider.disconnect().catch(() => undefined);
      subject.complete();
      this.progressSubjects.delete(sourceId);
      this.activeScans.delete(sourceId);
    }
  }

  private async importFile(
    provider: FileProvider,
    source: Source,
    relativePath: string,
    existingByPath: Map<string, Photo>,
    seenHashes: Set<string>,
  ): Promise<void> {
    // The file read (potentially over a slow SMB link) stays outside the
    // limiter so it doesn't consume a CPU-work slot while waiting on I/O.
    const buffer = await provider.readFile(relativePath);

    // Hashing + EXIF/metadata parsing is the real CPU cost per file — bounded
    // by the same app-wide limiter PhotoCacheService uses, so a scan running
    // at the same time the slideshow is prefetching doesn't stack unbounded
    // concurrent CPU work on top of it.
    await cpuWorkLimiter(async () => {
      const fileHash = createHash('sha256').update(buffer).digest('hex');

      const existing = existingByPath.get(relativePath);
      if (existing) {
        existingByPath.delete(relativePath); // claimed — not stale
        if (existing.fileHash === fileHash) {
          return; // unchanged since last scan
        }
        // Content changed at this path since the last scan — the old row and
        // its cache file are superseded by the re-import below.
        await this.photoRepo.remove(existing);
        notifyPhotosDeleted([existing.id]);
        await this.cacheStorage.delete(existing.cachedDisplayPath);
        seenHashes.delete(existing.fileHash);
      }

      if (seenHashes.has(fileHash)) {
        return; // identical content already imported from another path this scan
      }

      const metadata = await sharp(buffer).metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error('Could not determine image dimensions');
      }
      const dims = computeDisplayDimensions(
        metadata.width,
        metadata.height,
        metadata.orientation,
      );

      let capturedAt: Date | null = null;
      try {
        const exifData = await exifr.parse(buffer, {
          pick: ['DateTimeOriginal', 'CreateDate'],
        });
        const date = exifData?.DateTimeOriginal ?? exifData?.CreateDate;
        capturedAt = date instanceof Date ? date : null;
      } catch {
        capturedAt = null;
      }

      const location = await this.extractLocation(buffer);

      // Deliberately no thumbnail/cache generation here — that happens lazily
      // on first display request (see PhotoCacheService), so importing a
      // large library stays fast and doesn't write anything to disk upfront.
      const photo = this.photoRepo.create({
        sourceId: source.id,
        relativePath,
        fileHash,
        width: dims.width,
        height: dims.height,
        orientation: dims.orientation,
        capturedAt,
        cachedDisplayPath: null,
        ...location,
      });
      await this.photoRepo.save(photo);
      seenHashes.add(fileHash);
    });
  }

  /**
   * GPS extraction is cheap (parsing the already-in-memory EXIF buffer), but
   * the reverse-geocode lookup is only fast once GeocodingService has
   * finished its one-time GeoNames data download — the first photo(s)
   * imported after a fresh install may wait a bit here, everything after is
   * a fast in-memory lookup. locationCheckedAt is stamped regardless of
   * whether GPS data was found, so a photo with no GPS EXIF is never
   * needlessly re-read by the location backfill.
   */
  private async extractLocation(buffer: Buffer): Promise<{
    gpsLatitude: number | null;
    gpsLongitude: number | null;
    locationCity: string | null;
    locationCountry: string | null;
    locationScanned: boolean;
    locationCheckedAt: Date;
  }> {
    const gps = await exifr.gps(buffer).catch(() => null);
    if (!gps) {
      return {
        gpsLatitude: null,
        gpsLongitude: null,
        locationCity: null,
        locationCountry: null,
        locationScanned: true,
        locationCheckedAt: new Date(),
      };
    }
    const resolved = await this.geocodingService.resolve(
      gps.latitude,
      gps.longitude,
    );
    return {
      gpsLatitude: gps.latitude,
      gpsLongitude: gps.longitude,
      locationCity: resolved?.city ?? null,
      locationCountry: resolved?.country ?? null,
      locationScanned: true,
      locationCheckedAt: new Date(),
    };
  }

  /** Fire-and-forget: caller does not await backfill completion. */
  triggerLocationBackfill(sourceId?: number): void {
    this.backfillLocations(sourceId).catch((err) => {
      this.logger.error('Location backfill failed', err);
    });
  }

  isLocationBackfillActive(sourceId: number): boolean {
    return this.activeLocationBackfills.has(sourceId);
  }

  /**
   * Re-reads every photo imported before this feature existed (locationScanned
   * = false) from its original file to extract GPS + resolve a location,
   * grouped by source so each source's FileProvider connects only once.
   */
  private async backfillLocations(sourceId?: number): Promise<void> {
    if (sourceId !== undefined && this.activeLocationBackfills.has(sourceId))
      return;
    if (sourceId !== undefined && this.activeScans.has(sourceId)) return;
    const reservedSourceId = sourceId;
    if (reservedSourceId !== undefined) {
      this.activeLocationBackfills.add(reservedSourceId);
      this.subjectFor(reservedSourceId).next({
        status: 'backfilling_locations',
        processed: 0,
        total: 0,
      });
    }
    try {
      const query = this.photoRepo
        .createQueryBuilder('photo')
        .where('photo.locationScanned = :locationScanned', {
          locationScanned: false,
        });
      if (sourceId !== undefined) {
        query.andWhere('photo.sourceId = :sourceId', { sourceId });
      }
      const photos = await query.getMany();
      this.logger.log(`Location backfill: ${photos.length} photo(s) to check`);

      const bySource = new Map<number, Photo[]>();
      for (const photo of photos) {
        const group = bySource.get(photo.sourceId);
        if (group) group.push(photo);
        else bySource.set(photo.sourceId, [photo]);
      }

      const limit = pLimit(SCAN_CONCURRENCY);
      for (const [currentSourceId, sourcePhotos] of bySource) {
        const isReservedSource = currentSourceId === reservedSourceId;
        if (
          !isReservedSource &&
          (this.activeLocationBackfills.has(currentSourceId) ||
            this.activeScans.has(currentSourceId))
        ) {
          continue;
        }
        const source = await this.sourceRepo.findOneBy({ id: currentSourceId });
        if (!source) {
          if (isReservedSource) {
            const subject = this.subjectFor(currentSourceId);
            subject.next({ status: 'idle', processed: 0, total: 0 });
            subject.complete();
            this.progressSubjects.delete(currentSourceId);
            this.activeLocationBackfills.delete(currentSourceId);
          }
          continue;
        }
        if (!isReservedSource) {
          this.activeLocationBackfills.add(currentSourceId);
        }
        const subject = this.subjectFor(currentSourceId);
        let processed = 0;
        subject.next({
          status: 'backfilling_locations',
          processed,
          total: sourcePhotos.length,
        });
        const provider = this.fileProviderFactory.forSource(source);
        try {
          await provider.connect();
          await Promise.all(
            sourcePhotos.map((photo) =>
              limit(async () => {
                try {
                  const buffer = await provider.readFile(photo.relativePath);
                  const location = await cpuWorkLimiter(() =>
                    this.extractLocation(buffer),
                  );
                  await this.photoRepo.update(photo.id, location);
                } catch (err) {
                  this.logger.warn(
                    `Location backfill failed for photo ${photo.id}: ${(err as Error).message}`,
                  );
                } finally {
                  processed += 1;
                  subject.next({
                    status: 'backfilling_locations',
                    processed,
                    total: sourcePhotos.length,
                    currentFile: photo.relativePath,
                  });
                }
              }),
            ),
          );
          subject.next({
            status: 'idle',
            processed: sourcePhotos.length,
            total: sourcePhotos.length,
          });
        } catch (err) {
          const message = (err as Error).message;
          this.logger.warn(
            `Location backfill failed for source ${currentSourceId}: ${message}`,
          );
          subject.next({
            status: 'error',
            processed,
            total: sourcePhotos.length,
            error: message,
          });
        } finally {
          await provider.disconnect().catch(() => undefined);
          subject.complete();
          this.progressSubjects.delete(currentSourceId);
          this.activeLocationBackfills.delete(currentSourceId);
        }
      }
      if (reservedSourceId !== undefined && !bySource.has(reservedSourceId)) {
        const subject = this.subjectFor(reservedSourceId);
        subject.next({ status: 'idle', processed: 0, total: 0 });
        subject.complete();
        this.progressSubjects.delete(reservedSourceId);
        this.activeLocationBackfills.delete(reservedSourceId);
      }
      this.logger.log(
        `Location backfill completed for ${photos.length} photo(s)`,
      );
    } catch (err) {
      if (reservedSourceId !== undefined) {
        const subject = this.subjectFor(reservedSourceId);
        const message = (err as Error).message;
        subject.next({
          status: 'error',
          processed: 0,
          total: 0,
          error: message,
        });
        subject.complete();
        this.progressSubjects.delete(reservedSourceId);
        this.activeLocationBackfills.delete(reservedSourceId);
      }
      throw err;
    }
  }

  private subjectFor(sourceId: number): Subject<ScanProgressEvent> {
    let subject = this.progressSubjects.get(sourceId);
    if (!subject) {
      subject = new Subject<ScanProgressEvent>();
      this.progressSubjects.set(sourceId, subject);
    }
    return subject;
  }
}

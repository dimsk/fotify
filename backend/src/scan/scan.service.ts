import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subject, Observable, of } from 'rxjs';
import { createHash } from 'crypto';
import { extname } from 'path';
import sharp from 'sharp';
import * as exifr from 'exifr';
import { Source } from '../sources/source.entity';
import { Photo } from '../photos/photo.entity';
import { Settings } from '../settings/settings.entity';
import { DEFAULT_SETTINGS } from '../settings/settings-defaults';
import { FileProvider } from '../file-providers/file-provider.interface';
import { FileProviderFactory } from '../file-providers/file-provider.factory';
import { CacheStorageService } from './cache-storage.service';
import { GeocodingService } from './geocoding.service';
import { WalkedFile, walkMediaFiles } from './directory-walker';
import { computeDisplayDimensions } from './exif-orientation.util';
import { cpuWorkLimiter } from '../common/cpu-work-limiter';
import { notifyPhotosDeleted } from '../common/photo-deletion.notifier';
import { VideoProcessingService } from '../media/video-processing.service';

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif']);
const COMMON_VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.m4v',
  '.webm',
  '.mkv',
  '.avi',
]);

export interface ScanProgressEvent {
  status:
    | 'scanning'
    | 'backfilling_locations'
    | 'backfilling_lens_aperture'
    | 'idle'
    | 'error';
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
  private readonly activeLensApertureBackfills = new Set<number>();
  private readonly progressListeners = new Set<
    (sourceId: number, event: ScanProgressEvent) => void
  >();

  constructor(
    @InjectRepository(Source) private readonly sourceRepo: Repository<Source>,
    @InjectRepository(Photo) private readonly photoRepo: Repository<Photo>,
    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,
    private readonly fileProviderFactory: FileProviderFactory,
    private readonly cacheStorage: CacheStorageService,
    private readonly geocodingService: GeocodingService,
    private readonly videoProcessing: VideoProcessingService,
  ) {}

  /**
   * Registers a sink (the WebSocket gateway) that receives every scan
   * progress event, so the admin UI can be pushed instead of holding an SSE
   * stream open per source.
   */
  addProgressListener(
    listener: (sourceId: number, event: ScanProgressEvent) => void,
  ): void {
    this.progressListeners.add(listener);
  }

  /** The latest known progress for a source — for clients subscribing mid-scan. */
  async currentProgress(sourceId: number): Promise<ScanProgressEvent> {
    const source = await this.sourceRepo.findOneBy({ id: sourceId });
    const running =
      this.activeScans.has(sourceId) ||
      this.activeLocationBackfills.has(sourceId) ||
      this.activeLensApertureBackfills.has(sourceId);
    return {
      status: running ? 'scanning' : (source?.status ?? 'idle'),
      processed: 0,
      total: 0,
      error: source?.lastScanError ?? undefined,
    };
  }

  private publishProgress(sourceId: number, event: ScanProgressEvent): void {
    for (const listener of this.progressListeners) {
      try {
        listener(sourceId, event);
      } catch (error) {
        this.logger.error('Scan progress listener failed', error);
      }
    }
  }

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
      this.activeLocationBackfills.has(sourceId) ||
      this.activeLensApertureBackfills.has(sourceId)
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

  /**
   * The media extensions a scan should pick up right now: the supported
   * formats intersected with the user's enabled-format settings.
   */
  private async enabledMediaExtensions(): Promise<Set<string>> {
    const settings = await this.settingsRepo.findOneBy({ id: 1 });
    const images = new Set(
      settings?.enabledImageFormats?.length
        ? settings.enabledImageFormats
        : DEFAULT_SETTINGS.enabledImageFormats!,
    );
    const videos = new Set(
      settings?.enabledVideoFormats?.length
        ? settings.enabledVideoFormats
        : DEFAULT_SETTINGS.enabledVideoFormats!,
    );
    return new Set(
      [...IMAGE_EXTENSIONS, ...COMMON_VIDEO_EXTENSIONS].filter(
        (extension) => images.has(extension) || videos.has(extension),
      ),
    );
  }

  /** Fire-and-forget: caller does not await scan completion. */
  triggerScan(sourceId: number): void {
    this.scanSource(sourceId).catch((err) => {
      this.logger.error(`Scan of source ${sourceId} failed`, err);
    });
  }

  /** Fire-and-forget: caller does not await scan completion. */
  triggerQuickScan(sourceId: number): void {
    this.quickScanSource(sourceId).catch((err) => {
      this.logger.error(`Quick scan of source ${sourceId} failed`, err);
    });
  }

  /**
   * Lightweight discovery pass: walks the source and imports only files
   * whose relative path is not yet in the database. No hash, timestamp, or
   * size comparison — known paths are skipped by name alone, and deleted
   * files are NOT pruned (that remains the full scan's job), so this stays
   * cheap enough to run on a schedule even for large libraries. Returns the
   * paths of the newly imported files.
   */
  async quickScanSource(sourceId: number): Promise<string[]> {
    if (this.activeScans.has(sourceId)) {
      return [];
    }
    this.activeScans.add(sourceId);

    const source = await this.sourceRepo.findOneBy({ id: sourceId });
    if (!source) {
      this.activeScans.delete(sourceId);
      return [];
    }

    const subject = this.subjectFor(sourceId);
    source.status = 'scanning';
    source.lastScanError = null;
    await this.sourceRepo.save(source);
    subject.next({ status: 'scanning', processed: 0, total: 0 });

    const provider = this.fileProviderFactory.forSource(source);

    try {
      await provider.connect();
      const mediaExtensions = await this.enabledMediaExtensions();
      const files = await walkMediaFiles(provider, mediaExtensions);

      const existingPhotos = await this.photoRepo.find({
        where: { sourceId },
        select: ['id', 'relativePath', 'fileHash'],
      });
      const existingPaths = new Set(existingPhotos.map((p) => p.relativePath));
      const seenHashes = new Set(existingPhotos.map((p) => p.fileHash));
      const newFiles = files.filter(
        (file) => !existingPaths.has(file.relativePath),
      );

      let processed = 0;
      const addedFiles: string[] = [];
      subject.next({
        status: 'scanning',
        processed: 0,
        total: newFiles.length,
      });

      // Sequential, not parallel: one file at a time keeps disk I/O linear
      // instead of letting several concurrent reads/encodes thrash the HDD
      // head — matters on spinning-rust NAS drives (e.g. Synology), where
      // parallel scans actually finish slower than sequential ones.
      for (const file of newFiles) {
        try {
          const extension = extname(file.relativePath).toLowerCase();
          // Empty maps: nothing to claim or prune — every file here is
          // known-new by path, so the importers only ever hit their
          // "create" branch (or the moved-file duplicate check).
          const noExisting = new Map<string, Photo>();
          if (COMMON_VIDEO_EXTENSIONS.has(extension)) {
            await this.importVideo(provider, source, file, noExisting, seenHashes);
          } else {
            await this.importImage(
              provider,
              source,
              file,
              noExisting,
              seenHashes,
            );
          }
          addedFiles.push(file.relativePath);
        } catch (err) {
          this.logger.warn(
            `Failed to import ${file.relativePath}: ${(err as Error).message}`,
          );
        } finally {
          processed += 1;
          subject.next({
            status: 'scanning',
            processed,
            total: newFiles.length,
            currentFile: file.relativePath,
          });
        }
      }

      source.status = 'idle';
      await this.sourceRepo.save(source);
      subject.next({
        status: 'idle',
        processed: newFiles.length,
        total: newFiles.length,
      });
      return addedFiles;
    } catch (err) {
      const message = (err as Error).message;
      source.status = 'error';
      source.lastScanError = message;
      await this.sourceRepo.save(source);
      subject.next({ status: 'error', processed: 0, total: 0, error: message });
      return [];
    } finally {
      await provider.disconnect().catch(() => undefined);
      subject.complete();
      this.progressSubjects.delete(sourceId);
      this.activeScans.delete(sourceId);
    }
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
      const mediaExtensions = await this.enabledMediaExtensions();
      const files = await walkMediaFiles(provider, mediaExtensions);

      const existingPhotos = await this.photoRepo.find({ where: { sourceId } });
      // Rows whose extension is no longer among the enabled formats are
      // removed up front — a deselected format should drop its files from
      // the library on the next scan, not keep them around forever.
      const formatPruned = existingPhotos.filter(
        (photo) =>
          !mediaExtensions.has(extname(photo.relativePath).toLowerCase()),
      );
      const keptPhotos = existingPhotos.filter((photo) =>
        mediaExtensions.has(extname(photo.relativePath).toLowerCase()),
      );
      // Keyed by relativePath (a file's stable identity within a source) so
      // we can tell "unchanged", "content changed at this path", and "path
      // no longer exists" apart. Entries get claimed (deleted from this map)
      // as matching current files are processed below; whatever remains
      // afterwards is stale — its source file was deleted or moved since
      // the last scan — and gets pruned along with its cache file.
      const existingByPath = new Map(
        keptPhotos.map((p) => [p.relativePath, p]),
      );
      const seenHashes = new Set(keptPhotos.map((p) => p.fileHash));

      let processed = 0;
      subject.next({
        status: 'scanning',
        processed: 0,
        total: files.length,
      });

      // Sequential, not parallel — see the quick-scan path above.
      for (const file of files) {
        try {
          const extension = extname(file.relativePath).toLowerCase();
          if (COMMON_VIDEO_EXTENSIONS.has(extension)) {
            await this.importVideo(
              provider,
              source,
              file,
              existingByPath,
              seenHashes,
            );
          } else {
            await this.importImage(
              provider,
              source,
              file,
              existingByPath,
              seenHashes,
            );
          }
        } catch (err) {
          // The source file was discovered, so an import failure must not
          // make an existing row look stale and delete it below.
          existingByPath.delete(file.relativePath);
          this.logger.warn(
            `Failed to import ${file.relativePath}: ${(err as Error).message}`,
          );
        } finally {
          processed += 1;
          subject.next({
            status: 'scanning',
            processed,
            total: files.length,
            currentFile: file.relativePath,
          });
        }
      }

      const stalePhotos = [...existingByPath.values(), ...formatPruned];
      if (stalePhotos.length > 0) {
        await this.photoRepo.remove(stalePhotos);
        notifyPhotosDeleted(stalePhotos.map((p) => p.id));
        await Promise.all(
          stalePhotos.map((p) => this.cacheStorage.delete(p.cachedDisplayPath)),
        );
        if (formatPruned.length > 0) {
          this.logger.log(
            `Scan of source ${sourceId}: removed ${formatPruned.length} row(s) with deselected format(s)`,
          );
        }
      }

      source.status = 'idle';
      await this.sourceRepo.save(source);
      subject.next({
        status: 'idle',
        processed: files.length,
        total: files.length,
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

  private async importImage(
    provider: FileProvider,
    source: Source,
    file: WalkedFile,
    existingByPath: Map<string, Photo>,
    seenHashes: Set<string>,
  ): Promise<void> {
    const relativePath = file.relativePath;
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
        if (existing.mediaType === 'image' && existing.fileHash === fileHash) {
          return; // unchanged since last scan
        }
      }

      if (seenHashes.has(fileHash)) {
        await this.claimMovedFile(
          source.id,
          file,
          fileHash,
          'image',
          existing,
          existingByPath,
          seenHashes,
        );
        return; // identical content already imported from another path this scan
      }

      const metadata = await this.readImageMetadata(buffer, relativePath);
      if (!metadata.width || !metadata.height) {
        throw new Error('Could not determine image dimensions');
      }
      const dims = computeDisplayDimensions(
        metadata.width,
        metadata.height,
        metadata.orientation,
      );

      let capturedAt: Date | null = null;
      let lens: string | null = null;
      let aperture: number | null = null;
      try {
        const exifData = await exifr.parse(buffer, {
          pick: ['DateTimeOriginal', 'CreateDate', 'LensModel', 'FNumber'],
        });
        const date = exifData?.DateTimeOriginal ?? exifData?.CreateDate;
        capturedAt = date instanceof Date ? date : null;
        lens =
          typeof exifData?.LensModel === 'string' && exifData.LensModel.trim()
            ? exifData.LensModel.trim()
            : null;
        aperture =
          typeof exifData?.FNumber === 'number' && Number.isFinite(exifData.FNumber)
            ? exifData.FNumber
            : null;
      } catch {
        capturedAt = null;
        lens = null;
        aperture = null;
      }

      const location = await this.extractLocation(buffer);

      // Deliberately no thumbnail/cache generation here — that happens lazily
      // on first display request (see PhotoCacheService), so importing a
      // large library stays fast and doesn't write anything to disk upfront.
      const photo = this.photoRepo.create({
        sourceId: source.id,
        relativePath,
        mediaType: 'image',
        fileHash,
        width: dims.width,
        height: dims.height,
        orientation: dims.orientation,
        capturedAt,
        lens,
        aperture,
        lensApertureScanned: true,
        lensApertureCheckedAt: new Date(),
        cachedDisplayPath: null,
        cachedVideoMode: null,
        durationMs: null,
        mimeType: null,
        videoCodec: null,
        videoContainer: null,
        sourceFileSize: file.size,
        sourceModifiedAt: file.modifiedAt,
        ...location,
      });
      await this.photoRepo.save(photo);
      if (existing) {
        await this.photoRepo.remove(existing);
        notifyPhotosDeleted([existing.id]);
        await this.cacheStorage.delete(existing.cachedDisplayPath);
        seenHashes.delete(existing.fileHash);
      }
      seenHashes.add(fileHash);
    });
  }

  private async importVideo(
    provider: FileProvider,
    source: Source,
    file: WalkedFile,
    existingByPath: Map<string, Photo>,
    seenHashes: Set<string>,
  ): Promise<void> {
    const existing = existingByPath.get(file.relativePath);
    if (
      existing?.mediaType === 'video' &&
      file.size !== null &&
      existing.sourceFileSize === file.size &&
      file.modifiedAt !== null &&
      existing.sourceModifiedAt?.getTime() === file.modifiedAt.getTime()
    ) {
      existingByPath.delete(file.relativePath);
      return;
    }

    await this.videoProcessing.withMaterializedFile(
      provider,
      file.relativePath,
      async (path, fileHash) => {
        const metadata = await this.videoProcessing.probe(path, file.relativePath);
        if (existing) {
          existingByPath.delete(file.relativePath);
          if (existing.mediaType === 'video' && existing.fileHash === fileHash) {
            await this.photoRepo.update(existing.id, {
              sourceFileSize: file.size,
              sourceModifiedAt: file.modifiedAt,
            });
            return;
          }
        }

        if (seenHashes.has(fileHash)) {
          await this.claimMovedFile(
            source.id,
            file,
            fileHash,
            'video',
            existing,
            existingByPath,
            seenHashes,
          );
          return;
        }

        const video = this.photoRepo.create({
          sourceId: source.id,
          relativePath: file.relativePath,
          mediaType: 'video',
          fileHash,
          width: metadata.width,
          height: metadata.height,
          orientation: metadata.orientation,
          durationMs: metadata.durationMs,
          mimeType: metadata.mimeType,
          videoCodec: metadata.codec,
          videoContainer: metadata.container,
          sourceFileSize: file.size,
          sourceModifiedAt: file.modifiedAt,
          capturedAt: null,
          lens: null,
          aperture: null,
          lensApertureScanned: true,
          lensApertureCheckedAt: new Date(),
          gpsLatitude: null,
          gpsLongitude: null,
          locationCity: null,
          locationCountry: null,
          locationScanned: true,
          locationCheckedAt: new Date(),
          cachedDisplayPath: null,
          cachedVideoMode: null,
          cachedAt: null,
          lastShownAt: null,
        });
        await this.photoRepo.save(video);
        if (existing) {
          await this.photoRepo.remove(existing);
          notifyPhotosDeleted([existing.id]);
          await this.cacheStorage.delete(existing.cachedDisplayPath);
          seenHashes.delete(existing.fileHash);
        }
        seenHashes.add(fileHash);
      },
    );
  }

  private async claimMovedFile(
    sourceId: number,
    file: WalkedFile,
    fileHash: string,
    mediaType: 'image' | 'video',
    replacedAtTarget: Photo | undefined,
    existingByPath: Map<string, Photo>,
    seenHashes: Set<string>,
  ): Promise<void> {
    const duplicate = await this.photoRepo.findOneBy({ fileHash });
    if (
      !duplicate ||
      duplicate.sourceId !== sourceId ||
      duplicate.mediaType !== mediaType ||
      !existingByPath.has(duplicate.relativePath)
    ) {
      return;
    }

    const oldPath = duplicate.relativePath;
    await this.photoRepo.update(duplicate.id, {
      relativePath: file.relativePath,
      sourceFileSize: file.size,
      sourceModifiedAt: file.modifiedAt,
    });
    existingByPath.delete(oldPath);
    existingByPath.delete(file.relativePath);

    if (replacedAtTarget && replacedAtTarget.id !== duplicate.id) {
      await this.photoRepo.remove(replacedAtTarget);
      notifyPhotosDeleted([replacedAtTarget.id]);
      await this.cacheStorage.delete(replacedAtTarget.cachedDisplayPath);
      seenHashes.delete(replacedAtTarget.fileHash);
    }
  }

  /**
   * Reads image dimensions via sharp. iPhone HEICs with derived images
   * (Live Photos, depth maps, bursts) pack 30-50+ references into the iref
   * box, which trips libheif's default security limit of 16 and makes the
   * plain call fail with "corrupt header: heif: Invalid input". The files
   * are valid — retrying with `unlimited` lifts that limit using the same
   * bundled libvips/libheif, no external converter needed (works inside the
   * Docker image, e.g. on a Synology NAS, without extra packages).
   */
  private async readImageMetadata(
    buffer: Buffer,
    relativePath: string,
  ): Promise<{ width?: number; height?: number; orientation?: number }> {
    try {
      return await sharp(buffer).metadata();
    } catch (error) {
      const message = (error as Error).message;
      if (!/heif|iref|security limit/i.test(message)) throw error;
      // Expected for iPhone multi-image HEICs — routine retry, no need to log.
      this.logger.debug(
        `sharp rejected ${relativePath} (libheif security limit) — retrying with unlimited input`,
      );
      return sharp(buffer, { unlimited: true }).metadata();
    }
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
    if (!gps || !Number.isFinite(gps.latitude) || !Number.isFinite(gps.longitude)) {
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

  /**
   * Lens/aperture extraction is cheap (parsing the already-in-memory EXIF
   * buffer, no network lookup like the location backfill needs). lensApertureCheckedAt
   * is stamped regardless of whether the tags were found, so a photo
   * without lens/aperture EXIF is never needlessly re-read by the backfill.
   */
  private async extractLensAperture(buffer: Buffer): Promise<{
    lens: string | null;
    aperture: number | null;
    lensApertureScanned: boolean;
    lensApertureCheckedAt: Date;
  }> {
    let lens: string | null = null;
    let aperture: number | null = null;
    try {
      const exifData = await exifr.parse(buffer, {
        pick: ['LensModel', 'FNumber'],
      });
      lens =
        typeof exifData?.LensModel === 'string' && exifData.LensModel.trim()
          ? exifData.LensModel.trim()
          : null;
      aperture =
        typeof exifData?.FNumber === 'number' && Number.isFinite(exifData.FNumber)
          ? exifData.FNumber
          : null;
    } catch {
      lens = null;
      aperture = null;
    }
    return {
      lens,
      aperture,
      lensApertureScanned: true,
      lensApertureCheckedAt: new Date(),
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
        .where('photo.mediaType = :mediaType', { mediaType: 'image' })
        .andWhere('photo.locationScanned = :locationScanned', {
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
          // Sequential reads — same HDD-thrash reasoning as the main scan.
          for (const photo of sourcePhotos) {
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
          }
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

  /** Fire-and-forget: caller does not await backfill completion. */
  triggerLensApertureBackfill(sourceId?: number): void {
    this.backfillLensAperture(sourceId).catch((err) => {
      this.logger.error('Lens/aperture backfill failed', err);
    });
  }

  isLensApertureBackfillActive(sourceId: number): boolean {
    return this.activeLensApertureBackfills.has(sourceId);
  }

  /**
   * Re-reads every photo imported before this feature existed
   * (lensApertureScanned = false) from its original file to extract the
   * lens model and aperture, grouped by source so each source's
   * FileProvider connects only once. Mirrors backfillLocations above.
   */
  private async backfillLensAperture(sourceId?: number): Promise<void> {
    if (
      sourceId !== undefined &&
      this.activeLensApertureBackfills.has(sourceId)
    )
      return;
    if (sourceId !== undefined && this.activeScans.has(sourceId)) return;
    const reservedSourceId = sourceId;
    if (reservedSourceId !== undefined) {
      this.activeLensApertureBackfills.add(reservedSourceId);
      this.subjectFor(reservedSourceId).next({
        status: 'backfilling_lens_aperture',
        processed: 0,
        total: 0,
      });
    }
    try {
      const query = this.photoRepo
        .createQueryBuilder('photo')
        .where('photo.mediaType = :mediaType', { mediaType: 'image' })
        .andWhere('photo.lensApertureScanned = :lensApertureScanned', {
          lensApertureScanned: false,
        });
      if (sourceId !== undefined) {
        query.andWhere('photo.sourceId = :sourceId', { sourceId });
      }
      const photos = await query.getMany();
      this.logger.log(
        `Lens/aperture backfill: ${photos.length} photo(s) to check`,
      );

      const bySource = new Map<number, Photo[]>();
      for (const photo of photos) {
        const group = bySource.get(photo.sourceId);
        if (group) group.push(photo);
        else bySource.set(photo.sourceId, [photo]);
      }

      for (const [currentSourceId, sourcePhotos] of bySource) {
        const isReservedSource = currentSourceId === reservedSourceId;
        if (
          !isReservedSource &&
          (this.activeLensApertureBackfills.has(currentSourceId) ||
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
            this.activeLensApertureBackfills.delete(currentSourceId);
          }
          continue;
        }
        if (!isReservedSource) {
          this.activeLensApertureBackfills.add(currentSourceId);
        }
        const subject = this.subjectFor(currentSourceId);
        let processed = 0;
        subject.next({
          status: 'backfilling_lens_aperture',
          processed,
          total: sourcePhotos.length,
        });
        const provider = this.fileProviderFactory.forSource(source);
        try {
          await provider.connect();
          // Sequential reads — same HDD-thrash reasoning as the main scan.
          for (const photo of sourcePhotos) {
            try {
              const buffer = await provider.readFile(photo.relativePath);
              const lensAperture = await cpuWorkLimiter(() =>
                this.extractLensAperture(buffer),
              );
              await this.photoRepo.update(photo.id, lensAperture);
            } catch (err) {
              this.logger.warn(
                `Lens/aperture backfill failed for photo ${photo.id}: ${(err as Error).message}`,
              );
            } finally {
              processed += 1;
              subject.next({
                status: 'backfilling_lens_aperture',
                processed,
                total: sourcePhotos.length,
                currentFile: photo.relativePath,
              });
            }
          }
          subject.next({
            status: 'idle',
            processed: sourcePhotos.length,
            total: sourcePhotos.length,
          });
        } catch (err) {
          const message = (err as Error).message;
          this.logger.warn(
            `Lens/aperture backfill failed for source ${currentSourceId}: ${message}`,
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
          this.activeLensApertureBackfills.delete(currentSourceId);
        }
      }
      if (reservedSourceId !== undefined && !bySource.has(reservedSourceId)) {
        const subject = this.subjectFor(reservedSourceId);
        subject.next({ status: 'idle', processed: 0, total: 0 });
        subject.complete();
        this.progressSubjects.delete(reservedSourceId);
        this.activeLensApertureBackfills.delete(reservedSourceId);
      }
      this.logger.log(
        `Lens/aperture backfill completed for ${photos.length} photo(s)`,
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
        this.activeLensApertureBackfills.delete(reservedSourceId);
      }
      throw err;
    }
  }

  private subjectFor(sourceId: number): Subject<ScanProgressEvent> {
    let subject = this.progressSubjects.get(sourceId);
    if (!subject) {
      subject = new Subject<ScanProgressEvent>();
      // Fan every subject emission out to the push listeners (WebSocket
      // gateway) in addition to any SSE subscribers on this subject.
      const id = sourceId;
      subject.subscribe({
        next: (event) => this.publishProgress(id, event),
      });
      this.progressSubjects.set(sourceId, subject);
    }
    return subject;
  }
}

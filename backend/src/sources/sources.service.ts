import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Source } from './source.entity';
import { Photo } from '../photos/photo.entity';
import { ScanService } from '../scan/scan.service';
import { CacheStorageService } from '../scan/cache-storage.service';
import { FileProviderFactory } from '../file-providers/file-provider.factory';
import { encryptSecret } from '../file-providers/smb-credentials.util';
import { CreateSourceDto } from './create-source.dto';
import { BrowseSmbDto } from './browse.dto';
import {
  listLocalDirectory,
  DirectoryListing,
} from './local-directory-browser';
import { notifyPhotosDeleted } from '../common/photo-deletion.notifier';
import { isHiddenDirectoryName } from '../common/hidden-directories';

@Injectable()
export class SourcesService {
  constructor(
    @InjectRepository(Source) private readonly sourceRepo: Repository<Source>,
    @InjectRepository(Photo) private readonly photoRepo: Repository<Photo>,
    private readonly scanService: ScanService,
    private readonly cacheStorage: CacheStorageService,
    private readonly fileProviderFactory: FileProviderFactory,
  ) {}

  async list() {
    const sources = await this.sourceRepo.find({
      order: { createdAt: 'DESC' },
    });
    return Promise.all(
      sources.map(async ({ smbPasswordEnc, ...source }) => ({
        ...source,
        photoCount: await this.photoRepo.countBy({
          sourceId: source.id,
          mediaType: 'image',
        }),
        videoCount: await this.photoRepo.countBy({
          sourceId: source.id,
          mediaType: 'video',
        }),
        photosNeedingLocationBackfill: await this.photoRepo.countBy({
          sourceId: source.id,
          mediaType: 'image',
          locationScanned: false,
        }),
        locationBackfillActive: this.scanService.isLocationBackfillActive(
          source.id,
        ),
        photosNeedingLensApertureBackfill: await this.photoRepo.countBy({
          sourceId: source.id,
          mediaType: 'image',
          lensApertureScanned: false,
        }),
        lensApertureBackfillActive:
          this.scanService.isLensApertureBackfillActive(source.id),
        shownCount: await this.photoRepo
          .createQueryBuilder('photo')
          .where('photo.sourceId = :id', { id: source.id })
          .andWhere('photo.lastShownAt IS NOT NULL')
          .getCount(),
      })),
    );
  }

  async create(dto: CreateSourceDto): Promise<Omit<Source, 'smbPasswordEnc'>> {
    const source = this.sourceRepo.create({
      type: dto.type,
      name: dto.name,
      localPath: dto.type === 'local' ? (dto.localPath ?? null) : null,
      smbHost: dto.type === 'smb' ? (dto.smbHost ?? null) : null,
      smbShare: dto.type === 'smb' ? (dto.smbShare ?? null) : null,
      smbUsername: dto.type === 'smb' ? (dto.smbUsername ?? null) : null,
      smbPasswordEnc:
        dto.type === 'smb' && dto.smbPassword
          ? encryptSecret(dto.smbPassword)
          : null,
      smbDomain: dto.type === 'smb' ? (dto.smbDomain ?? '') : null,
      smbRootPath: dto.type === 'smb' ? (dto.smbRootPath ?? '') : null,
      status: 'idle',
    });
    const saved = await this.sourceRepo.save(source);
    this.scanService.triggerScan(saved.id);
    const { smbPasswordEnc, ...safeSource } = saved;
    return safeSource;
  }

  async remove(id: number): Promise<void> {
    const source = await this.sourceRepo.findOneBy({ id });
    if (!source) {
      throw new NotFoundException('Source not found');
    }
    const photos = await this.photoRepo.find({ where: { sourceId: id } });
    await this.sourceRepo.delete(id); // cascades Photo rows via FK ON DELETE CASCADE
    // So SlideshowStateService can purge these from its lookahead buffer
    // before one of them gets served — otherwise a client could poll and
    // receive a slide pointing at a photo id that no longer exists.
    notifyPhotosDeleted(photos.map((p) => p.id));
    await Promise.all(
      photos.map((photo) => this.cacheStorage.delete(photo.cachedDisplayPath)),
    );
  }

  async rescan(id: number): Promise<void> {
    const source = await this.sourceRepo.findOneBy({ id });
    if (!source) {
      throw new NotFoundException('Source not found');
    }
    this.scanService.triggerScan(id);
  }

  async backfillLocations(id: number): Promise<void> {
    const source = await this.sourceRepo.findOneBy({ id });
    if (!source) {
      throw new NotFoundException('Source not found');
    }
    this.scanService.triggerLocationBackfill(id);
  }

  async backfillLensAperture(id: number): Promise<void> {
    const source = await this.sourceRepo.findOneBy({ id });
    if (!source) {
      throw new NotFoundException('Source not found');
    }
    this.scanService.triggerLensApertureBackfill(id);
  }

  /**
   * Pausing only affects future slide selection and the automatic rescan
   * schedule — it never touches already-scanned photos or the manual
   * rescan/delete actions, and a slide already sitting in the lookahead
   * buffer when a source is paused is still shown once (it was fairly
   * picked before the pause); only new picks are excluded from here on.
   */
  async setPaused(id: number, paused: boolean): Promise<void> {
    const result = await this.sourceRepo.update({ id }, { paused });
    if (result.affected === 0) {
      throw new NotFoundException('Source not found');
    }
  }

  browseLocal(path?: string): Promise<DirectoryListing> {
    const target =
      path && path.length > 0 ? path : (process.env.FOTIFY_LOCAL_ROOT ?? '/');
    return listLocalDirectory(target);
  }

  async browseSmb(dto: BrowseSmbDto): Promise<DirectoryListing> {
    const provider = this.fileProviderFactory.forSmbConfig({
      host: dto.host,
      share: dto.share,
      username: dto.username,
      password: dto.password,
      domain: dto.domain ?? '',
      rootPath: '',
    });
    const currentPath = dto.path ?? '';
    const entries = await this.fileProviderFactory.withProvider(provider, (p) =>
      p.listDir(currentPath),
    );
    const directories = entries
      .filter(
        (entry) => entry.isDirectory && !isHiddenDirectoryName(entry.name),
      )
      .map((entry) => ({
        name: entry.name,
        path: currentPath ? `${currentPath}/${entry.name}` : entry.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const parentPath = currentPath.includes('/')
      ? currentPath.slice(0, currentPath.lastIndexOf('/'))
      : currentPath.length > 0
        ? ''
        : null;
    return { currentPath, parentPath, directories };
  }
}

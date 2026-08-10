import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Photo } from './photo.entity';
import { PhotoAction } from './photo-action.entity';
import { CollageLayoutType, Settings } from '../settings/settings.entity';
import { Source } from '../sources/source.entity';
import { QueuedSlide } from './queued-slide.entity';
import { PhotoCacheService } from '../media/photo-cache.service';
import { VideoCacheService } from '../media/video-cache.service';
import { EffectName, pickEffect } from './effect-picker.util';
import { SlidePhoto, SlidePlan } from './photos.service';
import { photoDeletions$ } from '../common/photo-deletion.notifier';
import {
  COLLAGE_LAYOUT_PHOTO_COUNTS,
  pickCollageLayout,
} from './collage-layouts';
import { isWithinTimeWindow } from '../common/time-window.util';
import { DEFAULT_SETTINGS } from '../settings/settings-defaults';
import { extname } from 'path';
import {
  randomVideoStartOffset,
  videoDisplayDuration,
} from './video-playback.util';

const ROTATION_DURATION_MS = 60 * 60 * 1000; // 1 hour
const LOOKAHEAD_DEPTH = 10;
const MIN_POLL_MS = 500;
const CLIENT_HEARTBEAT_TIMEOUT_MS = 45 * 1000;

type InternalSlidePlan =
  | { type: 'single'; photos: [Photo] }
  | { type: 'triple'; photos: [Photo, Photo, Photo] }
  | { type: 'collage'; photos: Photo[]; layout: CollageLayoutType }
  | { type: 'empty'; photos: [] };

/**
 * A slide sitting in the in-memory lookahead buffer, paired with the id of
 * the DB row (if any) that persists it — so it can be restored in the same
 * order after a restart, and deleted from the DB once consumed or purged.
 */
interface BufferedSlide {
  queuedSlideId: number | null;
  plan: InternalSlidePlan;
  videoStartOffsetMs: number;
  videoSegmentDurationMs: number | null;
}

interface CurrentSlide {
  slideId: string;
  plan: InternalSlidePlan;
  effect: EffectName;
  lookCinematic: boolean;
  startedAt: number | null;
  imageDurationMs: number;
  transitionDurationMs: number;
  videoStartOffsetMs: number;
}

export interface CurrentSlideResponse {
  slideId: string;
  type: 'single' | 'triple' | 'collage' | 'empty';
  photos: SlidePhoto[];
  collageLayout: CollageLayoutType | null;
  effect: EffectName;
  lookCinematic: boolean;
  imageDurationMs: number;
  transitionDurationMs: number;
  nextPollInMs: number;
  elapsedMs: number;
  waitingForPlayback: boolean;
  videoStartOffsetMs: number;
  next: {
    type: 'single' | 'triple' | 'collage' | 'empty';
    photos: SlidePhoto[];
    collageLayout: CollageLayoutType | null;
    videoStartOffsetMs: number;
  } | null;
}

/**
 * Owns the single, shared slideshow timeline: which slide is current, which
 * effect it uses, and when the next transition happens. The timeline only
 * advances while at least one slideshow client is heartbeating; when the
 * last client disappears it pauses in place and resumes from that slide when
 * a display reconnects.
 */
@Injectable()
export class SlideshowStateService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SlideshowStateService.name);
  private tickCounter = 0;
  private current: CurrentSlide | null = null;
  private upcoming: BufferedSlide[] = [];
  private lastEffect: EffectName | null = null;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private pausedRemainingMs: number | null = null;
  private readonly clientExpirations = new Map<string, number>();
  private advancing = false;
  private readinessPromise: Promise<void> | null = null;
  private clientPresenceDetectionEnabled = true;

  constructor(
    @InjectRepository(Photo) private readonly photoRepo: Repository<Photo>,
    @InjectRepository(PhotoAction)
    private readonly photoActionRepo: Repository<PhotoAction>,
    @InjectRepository(Settings)
    private readonly settingsRepo: Repository<Settings>,
    @InjectRepository(Source) private readonly sourceRepo: Repository<Source>,
    @InjectRepository(QueuedSlide)
    private readonly queuedSlideRepo: Repository<QueuedSlide>,
    private readonly photoCacheService: PhotoCacheService,
    private readonly videoCacheService: VideoCacheService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    photoDeletions$.subscribe((deletedIds) =>
      this.handlePhotosDeleted(deletedIds),
    );
    await this.restoreQueueFromDb();
    await this.refreshClientPresenceDetection();
    if (!this.clientPresenceDetectionEnabled) {
      await this.resumeSlideshow();
    }
  }

  async recordClientHeartbeat(clientId: string): Promise<void> {
    await this.refreshClientPresenceDetection();
    const hadActiveClients = this.hasActiveClients();
    this.clientExpirations.set(clientId, Date.now() + CLIENT_HEARTBEAT_TIMEOUT_MS);
    this.schedulePresenceCheck();
    if (!hadActiveClients || (!this.current && this.tickTimer === null)) {
      await this.resumeSlideshow();
    }
  }

  removeClient(clientId: string): void {
    this.clientExpirations.delete(clientId);
    if (!this.hasActiveClients()) {
      this.pauseSlideshow();
      return;
    }
    this.schedulePresenceCheck();
  }

  async recordSlideReady(clientId: string, slideId: string): Promise<void> {
    this.clientExpirations.set(
      clientId,
      Date.now() + CLIENT_HEARTBEAT_TIMEOUT_MS,
    );
    this.schedulePresenceCheck();
    if (
      !this.current ||
      this.current.slideId !== slideId ||
      this.current.startedAt !== null ||
      this.current.plan.type !== 'single' ||
      this.current.plan.photos[0].mediaType !== 'video'
    ) {
      return;
    }
    if (this.readinessPromise) return this.readinessPromise;

    const current = this.current;
    const work = (async () => {
      await this.markShown([current.plan.photos[0].id]);
      if (this.current !== current || current.startedAt !== null) return;
      current.startedAt = Date.now();
      this.scheduleAdvance(current.imageDurationMs);
    })().finally(() => {
      if (this.readinessPromise === work) this.readinessPromise = null;
    });
    this.readinessPromise = work;
    return work;
  }

  async recordSlideFailed(clientId: string, slideId: string): Promise<void> {
    this.clientExpirations.set(
      clientId,
      Date.now() + CLIENT_HEARTBEAT_TIMEOUT_MS,
    );
    this.schedulePresenceCheck();
    if (
      !this.current ||
      this.current.slideId !== slideId ||
      this.current.startedAt !== null ||
      this.current.plan.type !== 'single' ||
      this.current.plan.photos[0].mediaType !== 'video'
    ) {
      return;
    }
    if (this.readinessPromise) {
      await this.readinessPromise;
      return;
    }
    if (this.advancing) {
      setTimeout(() => {
        this.recordSlideFailed(clientId, slideId).catch((error) =>
          this.logger.error('Failed to skip unplayable video', error),
        );
      }, 100);
      return;
    }
    await this.advance();
  }

  /**
   * Reloads the lookahead buffer from the QueuedSlide table on startup, so
   * the slideshow resumes in the same order instead of re-randomizing.
   * Rows referencing a photo that no longer exists (deleted while the
   * service was down) are pruned rather than restored.
   */
  private async restoreQueueFromDb(): Promise<void> {
    const rows = await this.queuedSlideRepo.find({
      order: { id: 'ASC' },
      take: LOOKAHEAD_DEPTH,
    });
    if (rows.length === 0) return;

    const allIds = new Set<number>();
    for (const row of rows) {
      for (const id of row.photoIds) allIds.add(id);
    }
    const photos = await this.photoRepo.find({
      where: { id: In([...allIds]) },
    });
    const photoById = new Map(photos.map((p) => [p.id, p]));
    const hiddenActions = await this.photoActionRepo.find({
      select: ['photoId', 'hiddenAt'],
      where: { photoId: In([...allIds]) },
    });
    const hiddenPhotoIds = new Set(
      hiddenActions
        .filter((action) => action.hiddenAt)
        .map((action) => action.photoId),
    );

    const staleIds: number[] = [];
    for (const row of rows) {
      const resolved = row.photoIds.map((id) => photoById.get(id));
      const allResolved = resolved.every((p): p is Photo => p !== undefined);
      const anyHidden = row.photoIds.some((id) => hiddenPhotoIds.has(id));
      const validCount =
        row.type === 'single'
          ? resolved.length === 1
          : row.type === 'triple'
            ? resolved.length === 3
            : row.layout !== null &&
              resolved.length === COLLAGE_LAYOUT_PHOTO_COUNTS[row.layout]; // collage
      const validMediaTypes =
        row.type === 'single' ||
        resolved.every((photo) => photo?.mediaType === 'image');

      if (allResolved && validCount && validMediaTypes && !anyHidden) {
        const plan: InternalSlidePlan =
          row.type === 'single'
            ? { type: 'single', photos: [resolved[0]] }
            : row.type === 'triple'
              ? {
                  type: 'triple',
                  photos: [resolved[0], resolved[1], resolved[2]],
                }
              : { type: 'collage', photos: resolved, layout: row.layout! };
        this.upcoming.push({
          queuedSlideId: row.id,
          plan,
          videoStartOffsetMs: row.videoStartOffsetMs ?? 0,
          videoSegmentDurationMs: row.videoSegmentDurationMs ?? null,
        });
      } else {
        staleIds.push(row.id);
      }
    }

    if (staleIds.length > 0) {
      await this.queuedSlideRepo.delete(staleIds);
      this.logger.log(
        `Pruned ${staleIds.length} stale queued slide(s) referencing missing photo(s)`,
      );
    }
    if (this.upcoming.length > 0) {
      this.logger.log(
        `Restored ${this.upcoming.length} queued slide(s) from previous run`,
      );
    }
  }

  /**
   * Purges any buffered slide that references a now-deleted photo, so it
   * can never be served — without this, a source deletion (or a rescan
   * pruning/replacing a file) could leave a stale Photo reference sitting
   * in the lookahead buffer until it naturally cycled out, at which point
   * clients would 404 trying to load it mid-slideshow.
   */
  private handlePhotosDeleted(deletedIds: number[]): void {
    const deleted = new Set(deletedIds);
    const references = (buffered: BufferedSlide) =>
      buffered.plan.photos.some((p: Photo) => deleted.has(p.id));

    const before = this.upcoming.length;
    const purged = this.upcoming.filter((buffered) => references(buffered));
    this.upcoming = this.upcoming.filter((buffered) => !references(buffered));
    if (this.upcoming.length < before) {
      const purgedIds = purged
        .map((b) => b.queuedSlideId)
        .filter((id): id is number => id !== null);
      if (purgedIds.length > 0) {
        this.queuedSlideRepo
          .delete(purgedIds)
          .catch((err) =>
            this.logger.error('Failed to delete purged queued slide rows', err),
          );
      }
      this.logger.log(
        `Purged ${before - this.upcoming.length} buffered slide(s) referencing deleted photo(s)`,
      );
      if (this.hasActiveClients()) {
        this.fillUpcoming().catch((err) =>
          this.logger.error('Failed to refill lookahead buffer', err),
        );
      }
    }

    if (
      this.current &&
      references({
        queuedSlideId: null,
        plan: this.current.plan,
        videoStartOffsetMs: this.current.videoStartOffsetMs,
        videoSegmentDurationMs: null,
      })
    ) {
      this.logger.warn(
        'Currently-shown slide references a deleted photo — advancing immediately',
      );
      if (this.tickTimer !== null) {
        clearTimeout(this.tickTimer);
        this.tickTimer = null;
      }
      if (this.hasActiveClients()) {
        this.advance().catch((err) =>
          this.logger.error('Failed to advance past deleted photo', err),
        );
      } else {
        this.current = null;
        this.pausedRemainingMs = null;
      }
    }
  }

  getCurrentState(): CurrentSlideResponse {
    if (!this.current) {
      return {
        slideId: '0',
        type: 'empty',
        photos: [],
        collageLayout: null,
        effect: 'fade',
        lookCinematic: false,
        imageDurationMs: 6000,
        transitionDurationMs: 1200,
        nextPollInMs: 2000,
        elapsedMs: 0,
        waitingForPlayback: false,
        videoStartOffsetMs: 0,
        next: null,
      };
    }
    const waitingForPlayback = this.current.startedAt === null;
    const elapsed = waitingForPlayback
      ? 0
      : Date.now() - this.current.startedAt!;
    const nextPollInMs = waitingForPlayback
      ? MIN_POLL_MS
      : Math.max(MIN_POLL_MS, this.current.imageDurationMs - elapsed);
    const next = this.upcoming[0];

    return {
      slideId: this.current.slideId,
      type: this.current.plan.type,
      photos: this.current.plan.photos.map(toSlidePhoto),
      collageLayout: collageLayoutOf(this.current.plan),
      effect: this.current.effect,
      lookCinematic: this.current.lookCinematic,
      imageDurationMs: this.current.imageDurationMs,
      transitionDurationMs: this.current.transitionDurationMs,
      nextPollInMs,
      elapsedMs: Math.max(0, elapsed),
      waitingForPlayback,
      videoStartOffsetMs: this.current.videoStartOffsetMs,
      next: next
        ? {
            type: next.plan.type,
            photos: next.plan.photos.map(toSlidePhoto),
            collageLayout: collageLayoutOf(next.plan),
            videoStartOffsetMs: next.videoStartOffsetMs,
          }
        : null,
    };
  }

  private hasActiveClients(): boolean {
    if (!this.clientPresenceDetectionEnabled) return true;
    const now = Date.now();
    for (const [clientId, expiresAt] of this.clientExpirations) {
      if (expiresAt <= now) this.clientExpirations.delete(clientId);
    }
    return this.clientExpirations.size > 0;
  }

  private schedulePresenceCheck(): void {
    if (this.presenceTimer !== null) clearTimeout(this.presenceTimer);
    if (this.clientExpirations.size === 0) {
      this.presenceTimer = null;
      return;
    }

    const nextExpiry = Math.min(...this.clientExpirations.values());
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      if (!this.hasActiveClients()) {
        this.pauseSlideshow();
        return;
      }
      this.schedulePresenceCheck();
    }, Math.max(0, nextExpiry - Date.now()));
  }

  private pauseSlideshow(): void {
    if (this.tickTimer !== null) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
      if (this.current) {
        if (this.current.startedAt === null) return;
        this.pausedRemainingMs = Math.max(
          MIN_POLL_MS,
          this.current.imageDurationMs - (Date.now() - this.current.startedAt),
        );
      }
    }
  }

  private async resumeSlideshow(): Promise<void> {
    if (!this.hasActiveClients()) return;

    if (!this.current) {
      await this.fillUpcoming();
      await this.advance();
      return;
    }

    if (this.current.startedAt === null) return;

    const remainingMs =
      this.pausedRemainingMs ??
      Math.max(
        MIN_POLL_MS,
        this.current.imageDurationMs - (Date.now() - this.current.startedAt),
      );
    this.current.startedAt = Date.now() - (this.current.imageDurationMs - remainingMs);
    this.pausedRemainingMs = null;
    this.scheduleAdvance(remainingMs);
  }

  private scheduleAdvance(delayMs: number): void {
    if (!this.hasActiveClients()) {
      this.pausedRemainingMs = Math.max(MIN_POLL_MS, delayMs);
      return;
    }
    if (this.tickTimer !== null) clearTimeout(this.tickTimer);
    this.tickTimer = setTimeout(() => {
      this.tickTimer = null;
      this.advance().catch((err) =>
        this.logger.error('Failed to advance slideshow', err),
      );
    }, delayMs);
  }

  private async advance(): Promise<void> {
    if (this.advancing) return; // an advance is already in flight (e.g. a forced one raced the scheduled one)
    if (!this.hasActiveClients()) {
      this.pauseSlideshow();
      return;
    }
    this.advancing = true;
    try {
      this.pausedRemainingMs = null;
      const settings = await this.settingsRepo.findOneBy({ id: 1 });
      this.clientPresenceDetectionEnabled =
        settings?.clientPresenceDetectionEnabled ?? true;
      const asleep = this.isNightModeActive(settings);

      // During night mode the lookahead buffer is deliberately left alone —
      // nothing is shifted out of it — so the slideshow resumes with the
      // exact same upcoming order once the window ends, rather than losing
      // or reshuffling whatever was already queued.
      const buffered = asleep ? undefined : this.upcoming.shift();
      let plan: InternalSlidePlan = asleep
        ? { type: 'empty', photos: [] }
        : (buffered?.plan ?? { type: 'empty', photos: [] });
      let videoStartOffsetMs = buffered?.videoStartOffsetMs ?? 0;
      let videoSegmentDurationMs = buffered?.videoSegmentDurationMs ?? null;
      if (
        plan.type === 'single' &&
        plan.photos[0]?.mediaType === 'video' &&
        (settings?.videoCompatibilityMode ??
          DEFAULT_SETTINGS.videoCompatibilityMode!) === 'direct-mp4' &&
        extname(plan.photos[0].relativePath).toLowerCase() !== '.mp4'
      ) {
        plan = await this.pickSlidePlan();
        videoStartOffsetMs = this.randomVideoStartOffset(
          plan,
          settings?.imageDurationMs ?? DEFAULT_SETTINGS.imageDurationMs!,
        );
        videoSegmentDurationMs = null;
      }
      let videoPreparationFailed = false;
      const compatibilityMode =
        settings?.videoCompatibilityMode ??
        DEFAULT_SETTINGS.videoCompatibilityMode!;
      if (
        compatibilityMode === 'normalize' &&
        plan.type === 'single' &&
        plan.photos[0]?.mediaType === 'video'
      ) {
        // Direct-play modes stream straight from the source (see
        // MediaController.streamVideoFromSource) — there is no cache file to
        // prepare, so the advance must not block on ensureCached.
        try {
          await this.videoCacheService.ensureCached(plan.photos[0]);
        } catch (error) {
          this.logger.warn(
            `Skipping video ${plan.photos[0].id}: ${(error as Error).message}`,
          );
          plan = { type: 'empty', photos: [] };
          videoPreparationFailed = true;
        }
      }

      // The cinematic look is a per-photo color grade, not a transition
      // effect — when it lands, the transition is forced to a plain fade
      // so the grade itself reads cleanly rather than competing with a
      // busier effect. Collages get the same treatment: they already have
      // their own per-cell staggered fade/slide-in reveal (see
      // SlideshowEngine's applyCollageLayout), so a busier container-level
      // effect (dip-to-black, exposure flash, etc.) would just fight it.
      const lookCinematic =
        !asleep &&
        Math.random() * 100 <
          (settings?.cinematicChance ?? DEFAULT_SETTINGS.cinematicChance!);
      const effect =
        lookCinematic || plan.type === 'collage'
          ? 'fade'
          : pickEffect(
              settings?.transitionEffects ?? DEFAULT_SETTINGS.transitionEffects!,
              this.lastEffect,
            );
      this.lastEffect = effect;
      this.tickCounter += 1;

      if (
        buffered?.queuedSlideId !== null &&
        buffered?.queuedSlideId !== undefined
      ) {
        this.queuedSlideRepo
          .delete(buffered.queuedSlideId)
          .catch((err) =>
            this.logger.error(
              'Failed to delete consumed queued slide row',
              err,
            ),
          );
      }

      // Collages carry more to look at (up to 12 photos) than a single or
      // triple slide, so they stay on screen twice as long.
      const baseDuration =
        settings?.imageDurationMs ?? DEFAULT_SETTINGS.imageDurationMs!;
      const singleVideo =
        plan.type === 'single' && plan.photos[0]?.mediaType === 'video'
          ? plan.photos[0]
          : null;
      const durationMode =
        settings?.videoDurationMode ?? DEFAULT_SETTINGS.videoDurationMode!;
      if (singleVideo && durationMode === 'random-segment') {
        const maxOffset = Math.max(
          0,
          (singleVideo.durationMs ?? baseDuration) - baseDuration,
        );
        if (
          videoSegmentDurationMs !== baseDuration ||
          videoStartOffsetMs > maxOffset
        ) {
          videoStartOffsetMs = this.randomVideoStartOffset(
            plan,
            baseDuration,
          );
        }
      } else {
        videoStartOffsetMs = 0;
      }
      const imageDurationMs = singleVideo
        ? this.videoSlideDuration(singleVideo, settings, baseDuration)
        : videoPreparationFailed
          ? MIN_POLL_MS
          : plan.type === 'collage'
          ? baseDuration * 2
          : baseDuration;

      this.current = {
        slideId: String(this.tickCounter),
        plan,
        effect,
        lookCinematic,
        startedAt: singleVideo ? null : Date.now(),
        imageDurationMs,
        transitionDurationMs:
          settings?.transitionDurationMs ?? DEFAULT_SETTINGS.transitionDurationMs!,
        videoStartOffsetMs:
          singleVideo &&
          durationMode === 'random-segment'
            ? videoStartOffsetMs
            : 0,
      };

      if (plan.photos.length > 0 && !singleVideo) {
        await this.markShown(plan.photos.map((p) => p.id));
      }

      await this.fillUpcoming();

      // Re-read on every tick so a live settings change (effect/duration)
      // takes effect starting with the very next transition, not before.
      if (!singleVideo) {
        this.scheduleAdvance(this.current.imageDurationMs);
      }
    } finally {
      this.advancing = false;
    }
  }

  /**
   * True while the configured night-mode window is active — the slideshow
   * shows a blank screen instead of picking photos, without disturbing the
   * lookahead buffer (see advance()).
   */
  private isNightModeActive(settings: Settings | null): boolean {
    const enabled = settings?.nightModeEnabled ?? DEFAULT_SETTINGS.nightModeEnabled!;
    if (!enabled) return false;
    return isWithinTimeWindow(
      new Date(),
      settings?.nightModeStart ?? DEFAULT_SETTINGS.nightModeStart!,
      settings?.nightModeEnd ?? DEFAULT_SETTINGS.nightModeEnd!,
      settings?.scheduleTimezone ?? DEFAULT_SETTINGS.scheduleTimezone!,
    );
  }

  private async refreshClientPresenceDetection(): Promise<void> {
    const settings = await this.settingsRepo.findOneBy({ id: 1 });
    this.clientPresenceDetectionEnabled =
      settings?.clientPresenceDetectionEnabled ?? true;
  }

  private async fillUpcoming(): Promise<void> {
    const settings = await this.settingsRepo.findOneBy({ id: 1 });
    const imageDurationMs =
      settings?.imageDurationMs ?? DEFAULT_SETTINGS.imageDurationMs!;
    const useRandomSegment =
      (settings?.videoDurationMode ?? DEFAULT_SETTINGS.videoDurationMode!) ===
      'random-segment';
    while (this.upcoming.length < LOOKAHEAD_DEPTH) {
      const plan = await this.pickSlidePlan();
      if (plan.type === 'empty') break; // nothing available right now — stop trying
      const videoStartOffsetMs = useRandomSegment
        ? this.randomVideoStartOffset(plan, imageDurationMs)
        : 0;
      const videoSegmentDurationMs = useRandomSegment ? imageDurationMs : null;
      const queuedSlideId = await this.persistSlide(
        plan,
        videoStartOffsetMs,
        videoSegmentDurationMs,
      );
      this.upcoming.push({
        queuedSlideId,
        plan,
        videoStartOffsetMs,
        videoSegmentDurationMs,
      });
      this.prewarm(plan);
    }
  }

  /** Records a newly-picked slide in the QueuedSlide table so it survives a restart. */
  private async persistSlide(
    plan: InternalSlidePlan,
    videoStartOffsetMs: number,
    videoSegmentDurationMs: number | null,
  ): Promise<number | null> {
    if (plan.type === 'empty') return null;
    const result = await this.queuedSlideRepo.insert({
      type: plan.type,
      photoIds: plan.photos.map((p) => p.id),
      layout: plan.type === 'collage' ? plan.layout : null,
      videoStartOffsetMs,
      videoSegmentDurationMs,
    });
    return result.identifiers[0].id as number;
  }

  private randomVideoStartOffset(
    plan: InternalSlidePlan,
    displayDurationMs: number,
  ): number {
    if (plan.type !== 'single' || plan.photos[0].mediaType !== 'video') return 0;
    return randomVideoStartOffset(
      plan.photos[0].durationMs ?? displayDurationMs,
      displayDurationMs,
    );
  }

  /** Fire-and-forget: generates cache well ahead of when this slide will actually be shown. */
  private prewarm(plan: InternalSlidePlan): void {
    for (const photo of plan.photos) {
      const work =
        photo.mediaType === 'video'
          ? this.prewarmVideo(photo)
          : this.photoCacheService.ensureCached(photo);
      work?.catch((err) => {
        this.logger.warn(
          `Prewarm failed for photo ${photo.id}: ${(err as Error).message}`,
        );
      });
    }
  }

  /**
   * Direct-play modes stream the original file at request time, so there is
   * nothing to pre-generate — returns null to skip the warm-up entirely.
   */
  private async prewarmVideo(photo: Photo): Promise<unknown> {
    const settings = await this.settingsRepo.findOneBy({ id: 1 });
    const mode =
      settings?.videoCompatibilityMode ??
      DEFAULT_SETTINGS.videoCompatibilityMode!;
    if (mode !== 'normalize') return null;
    return this.videoCacheService.ensureCached(photo);
  }

  private markShown(ids: number[]): Promise<void> {
    return this.photoRepo
      .update({ id: In(ids) }, { lastShownAt: new Date() })
      .then(() => undefined);
  }

  private async pickSlidePlan(): Promise<InternalSlidePlan> {
    const settings = await this.settingsRepo.findOneBy({ id: 1 });
    const avoidRepeats = settings?.avoidRepeats ?? DEFAULT_SETTINGS.avoidRepeats!;
    const sourceId = await this.resolveActiveSourceId(settings);
    const mp4Only =
      (settings?.videoCompatibilityMode ??
        DEFAULT_SETTINGS.videoCompatibilityMode!) === 'direct-mp4';

    // Collage is a probability-gated pre-check, not a third term in the
    // single/triple weighting below — that formula balances the
    // portrait/landscape *pools* against each other, which has nothing to
    // do with whether a temporally-close cluster of photos happens to
    // exist. When enabled and the roll hits, try it first; if no valid
    // cluster exists (e.g. no EXIF capture dates), fall through to the
    // normal single/triple logic unchanged.
    const collageEnabled = settings?.collageEnabled ?? DEFAULT_SETTINGS.collageEnabled!;
    const collageChance = settings?.collageChance ?? DEFAULT_SETTINGS.collageChance!;
    const collageLayouts = settings?.collageLayouts ?? DEFAULT_SETTINGS.collageLayouts!;
    if (collageEnabled && Math.random() * 100 < collageChance) {
      const layout = pickCollageLayout(collageLayouts);
      const count = COLLAGE_LAYOUT_PHOTO_COUNTS[layout];
      const cluster = await this.randomTemporalCluster(
        sourceId,
        avoidRepeats,
        count,
        settings?.collageTimeWindowMinutes ?? DEFAULT_SETTINGS.collageTimeWindowMinutes!,
      );
      if (cluster) {
        return { type: 'collage', photos: cluster, layout };
      }
    }

    const [portraitCount, singleCount] = await Promise.all([
      this.countByOrientation('portrait', sourceId),
      this.countSingleEligible(sourceId, mp4Only),
    ]);

    if (portraitCount === 0 && singleCount === 0) {
      return { type: 'empty', photos: [] };
    }

    const canTriple = portraitCount >= 3;
    // Weight triple-slides so that, over time, each individual photo appears with
    // roughly equal frequency: a triple "spends" 3 portrait photos per appearance.
    const pTriple = canTriple
      ? singleCount === 0
        ? 1
        : portraitCount / (portraitCount + 3 * singleCount)
      : 0;

    if (canTriple && Math.random() < pTriple) {
      const photos =
        (settings?.adjacentPortraitTriples ?? DEFAULT_SETTINGS.adjacentPortraitTriples!)
          ? await this.randomAdjacentPortraitTriple(sourceId, avoidRepeats)
          : await this.randomPhotos('portrait', 3, sourceId, avoidRepeats).then(
              (p): [Photo, Photo, Photo] => [p[0], p[1], p[2]],
            );
      return { type: 'triple', photos };
    }
    if (singleCount > 0) {
      const [photo] = await this.randomSingleMedia(
        1,
        sourceId,
        avoidRepeats,
        mp4Only,
      );
      return { type: 'single', photos: [photo] };
    }
    // No landscape/square available at all — fall back to a single portrait.
    const [photo] = await this.randomPhotos(
      'portrait',
      1,
      sourceId,
      avoidRepeats,
    );
    return { type: 'single', photos: [photo] };
  }

  /**
   * Resolves which source (if any) the current slide selection should be
   * restricted to. In "all" mode there's no restriction. In
   * "source-rotation" mode, one randomly-chosen source stays active for
   * ROTATION_DURATION_MS before a different one is picked.
   */
  private async resolveActiveSourceId(
    settings: Settings | null,
  ): Promise<number | null> {
    if (!settings || settings.shuffleMode !== 'source-rotation') {
      return null;
    }

    const rotationExpired =
      !settings.rotationSourceId ||
      !settings.rotationStartedAt ||
      Date.now() - settings.rotationStartedAt.getTime() > ROTATION_DURATION_MS;

    if (!rotationExpired) {
      const stillActive = await this.sourceRepo.existsBy({
        id: settings.rotationSourceId!,
        paused: false,
      });
      if (stillActive) {
        return settings.rotationSourceId!;
      }
    }

    const sources = await this.sourceRepo.find({
      select: ['id'],
      where: { paused: false },
    });
    if (sources.length === 0) {
      return null;
    }
    const candidates = sources.filter(
      (s) => s.id !== settings.rotationSourceId,
    );
    const pool = candidates.length > 0 ? candidates : sources;
    const chosen = pool[Math.floor(Math.random() * pool.length)];

    settings.rotationSourceId = chosen.id;
    settings.rotationStartedAt = new Date();
    await this.settingsRepo.save(settings);

    return chosen.id;
  }

  /** Excludes paused sources and hidden photos — applied to every photo-selection query. */
  private excludeUnavailable(
    qb: SelectQueryBuilder<Photo>,
  ): SelectQueryBuilder<Photo> {
    return qb
      .leftJoin(PhotoAction, 'photoAction', 'photoAction.photoId = photo.id')
      .andWhere(
        'photo.sourceId NOT IN (SELECT id FROM source WHERE paused = 1)',
      )
      .andWhere('photoAction.hiddenAt IS NULL');
  }

  private countLandscapeOrSquare(sourceId: number | null): Promise<number> {
    const qb = this.photoRepo
      .createQueryBuilder('photo')
      .where('photo.orientation IN (:...orientations)', {
        orientations: ['landscape', 'square'],
      })
      .andWhere('photo.mediaType = :mediaType', { mediaType: 'image' });
    if (sourceId !== null)
      qb.andWhere('photo.sourceId = :sourceId', { sourceId });
    return this.excludeUnavailable(qb).getCount();
  }

  private countSingleEligible(
    sourceId: number | null,
    mp4Only: boolean,
  ): Promise<number> {
    const qb = this.photoRepo
      .createQueryBuilder('photo')
      .where(
        `((photo.mediaType = 'video' AND (:mp4Only = 0 OR LOWER(photo.relativePath) LIKE '%.mp4')) OR (photo.mediaType = 'image' AND photo.orientation IN (:...orientations)))`,
        { orientations: ['landscape', 'square'], mp4Only: mp4Only ? 1 : 0 },
      );
    if (sourceId !== null)
      qb.andWhere('photo.sourceId = :sourceId', { sourceId });
    return this.excludeUnavailable(qb).getCount();
  }

  private countByOrientation(
    orientation: string,
    sourceId: number | null,
  ): Promise<number> {
    const qb = this.photoRepo
      .createQueryBuilder('photo')
      .where('photo.orientation = :orientation', { orientation })
      .andWhere('photo.mediaType = :mediaType', { mediaType: 'image' });
    if (sourceId !== null)
      qb.andWhere('photo.sourceId = :sourceId', { sourceId });
    return this.excludeUnavailable(qb).getCount();
  }

  private async randomPhotos(
    orientation: string,
    limit: number,
    sourceId: number | null,
    avoidRepeats: boolean,
  ): Promise<Photo[]> {
    const qb = this.photoRepo
      .createQueryBuilder('photo')
      .where('photo.orientation = :orientation', { orientation })
      .andWhere('photo.mediaType = :mediaType', { mediaType: 'image' });
    if (sourceId !== null)
      qb.andWhere('photo.sourceId = :sourceId', { sourceId });
    this.applyOrdering(this.excludeUnavailable(qb), avoidRepeats).limit(limit);
    return qb.getMany();
  }

  /**
   * Picks one random portrait as an "anchor" (respecting avoidRepeats, same
   * as any other pick), then fills out the other two triple-slide slots
   * with its nearest neighbors by file path within the same source —
   * photos that sit next to each other in the source directory are usually
   * from the same moment/burst, so grouping them gives the triple a
   * coherent context instead of three unrelated portraits. Falls back to a
   * plain random pick of 3 if the anchor's own source doesn't have enough
   * portraits to form a contiguous group of 3 (e.g. its portraits are
   * spread thin across multiple sources).
   */
  private async randomAdjacentPortraitTriple(
    sourceId: number | null,
    avoidRepeats: boolean,
  ): Promise<[Photo, Photo, Photo]> {
    const [anchor] = await this.randomPhotos(
      'portrait',
      1,
      sourceId,
      avoidRepeats,
    );
    const neighbors = await this.excludeUnavailable(
      this.photoRepo
        .createQueryBuilder('photo')
        .where('photo.sourceId = :sourceId', { sourceId: anchor.sourceId })
        .andWhere('photo.mediaType = :mediaType', { mediaType: 'image' })
        .andWhere('photo.orientation = :orientation', {
          orientation: 'portrait',
        }),
    )
      .orderBy('photo.relativePath', 'ASC')
      .getMany();

    if (neighbors.length < 3) {
      const photos = await this.randomPhotos(
        'portrait',
        3,
        sourceId,
        avoidRepeats,
      );
      return [photos[0], photos[1], photos[2]];
    }

    const anchorIndex = neighbors.findIndex((p) => p.id === anchor.id);
    let start = anchorIndex - 1;
    if (start < 0) start = 0;
    if (start + 3 > neighbors.length) start = neighbors.length - 3;
    const [a, b, c] = neighbors.slice(start, start + 3);
    return [a, b, c];
  }

  /**
   * Picks a random "anchor" photo that has a capture timestamp, then
   * gathers every photo within ± windowMinutes of it — any orientation,
   * any source (capturedAt is a real absolute timestamp, so correlating
   * across sources is legitimate, e.g. two phones at the same event
   * imported as separate sources — unlike the file-path adjacency used
   * for portrait triples, which is only meaningful within one source's
   * directory listing). Returns null if fewer than `count` photos qualify,
   * so the caller falls through to the normal single/triple logic instead
   * of forcing a too-small collage. Otherwise returns a contiguous,
   * chronologically-ordered slice of exactly `count` photos centered on
   * the anchor (same clamped-window technique as
   * randomAdjacentPortraitTriple, keyed on time instead of file path) —
   * `count` comes from the chosen collage layout's fixed cell count, so
   * unlike that helper there's no free-ranging target size to roll here.
   */
  private async randomTemporalCluster(
    sourceId: number | null,
    avoidRepeats: boolean,
    count: number,
    windowMinutes: number,
  ): Promise<Photo[] | null> {
    const anchorQb = this.photoRepo
      .createQueryBuilder('photo')
      .where('photo.capturedAt IS NOT NULL')
      .andWhere('photo.mediaType = :mediaType', { mediaType: 'image' });
    if (sourceId !== null)
      anchorQb.andWhere('photo.sourceId = :sourceId', { sourceId });
    this.applyOrdering(this.excludeUnavailable(anchorQb), avoidRepeats).limit(
      1,
    );
    const [anchor] = await anchorQb.getMany();
    if (!anchor?.capturedAt) return null;

    const windowMs = windowMinutes * 60_000;
    const from = new Date(anchor.capturedAt.getTime() - windowMs);
    const to = new Date(anchor.capturedAt.getTime() + windowMs);

    const clusterQb = this.photoRepo
      .createQueryBuilder('photo')
      .where('photo.capturedAt BETWEEN :from AND :to', { from, to })
      .andWhere('photo.mediaType = :mediaType', { mediaType: 'image' });
    if (sourceId !== null)
      clusterQb.andWhere('photo.sourceId = :sourceId', { sourceId });
    const matches = await this.excludeUnavailable(clusterQb)
      .orderBy('photo.capturedAt', 'ASC')
      .getMany();

    if (matches.length < count) return null;

    const anchorIndex = matches.findIndex((p) => p.id === anchor.id);
    let start = anchorIndex - Math.floor((count - 1) / 2);
    if (start < 0) start = 0;
    if (start + count > matches.length) start = matches.length - count;
    return matches.slice(start, start + count);
  }

  private async randomLandscapeOrSquarePhotos(
    limit: number,
    sourceId: number | null,
    avoidRepeats: boolean,
  ): Promise<Photo[]> {
    const qb = this.photoRepo
      .createQueryBuilder('photo')
      .where('photo.orientation IN (:...orientations)', {
        orientations: ['landscape', 'square'],
      })
      .andWhere('photo.mediaType = :mediaType', { mediaType: 'image' });
    if (sourceId !== null)
      qb.andWhere('photo.sourceId = :sourceId', { sourceId });
    this.applyOrdering(this.excludeUnavailable(qb), avoidRepeats).limit(limit);
    return qb.getMany();
  }

  private async randomSingleMedia(
    limit: number,
    sourceId: number | null,
    avoidRepeats: boolean,
    mp4Only: boolean,
  ): Promise<Photo[]> {
    const qb = this.photoRepo
      .createQueryBuilder('photo')
      .where(
        `((photo.mediaType = 'video' AND (:mp4Only = 0 OR LOWER(photo.relativePath) LIKE '%.mp4')) OR (photo.mediaType = 'image' AND photo.orientation IN (:...orientations)))`,
        { orientations: ['landscape', 'square'], mp4Only: mp4Only ? 1 : 0 },
      );
    if (sourceId !== null)
      qb.andWhere('photo.sourceId = :sourceId', { sourceId });
    this.applyOrdering(this.excludeUnavailable(qb), avoidRepeats).limit(limit);
    return qb.getMany();
  }

  private videoSlideDuration(
    video: Photo,
    settings: Settings | null,
    imageDurationMs: number,
  ): number {
    const mode =
      settings?.videoDurationMode ?? DEFAULT_SETTINGS.videoDurationMode!;
    return videoDisplayDuration(
      mode,
      video.durationMs ?? imageDurationMs,
      imageDurationMs,
      settings?.videoMaxDurationMs ?? DEFAULT_SETTINGS.videoMaxDurationMs!,
    );
  }

  /**
   * Default: pure random order. With avoidRepeats on, never-shown photos
   * (lastShownAt IS NULL) sort first — randomly among themselves — and only
   * once those are exhausted do already-shown photos get reused, oldest
   * shown first.
   */
  private applyOrdering(
    qb: SelectQueryBuilder<Photo>,
    avoidRepeats: boolean,
  ): SelectQueryBuilder<Photo> {
    if (avoidRepeats) {
      return qb
        .orderBy('photo.lastShownAt IS NULL', 'DESC')
        .addOrderBy('photo.lastShownAt', 'ASC')
        .addOrderBy('RANDOM()', 'ASC');
    }
    return qb.orderBy('RANDOM()', 'ASC');
  }
}

function toSlidePhoto(photo: Photo): SlidePhoto {
  return {
    id: photo.id,
    url: `/photos/${photo.id}/display`,
    mediaType: photo.mediaType,
    width: photo.width,
    height: photo.height,
    durationMs: photo.durationMs,
    mimeType: photo.mimeType,
    orientation: photo.orientation,
    capturedAt: photo.capturedAt ? photo.capturedAt.toISOString() : null,
    locationCity: photo.locationCity,
    locationCountry: photo.locationCountry,
    lens: photo.lens,
    aperture: photo.aperture,
  };
}

function collageLayoutOf(plan: InternalSlidePlan): CollageLayoutType | null {
  return plan.type === 'collage' ? plan.layout : null;
}

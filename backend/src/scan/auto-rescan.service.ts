import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Source } from '../sources/source.entity';
import { Settings } from '../settings/settings.entity';
import { ScanService } from './scan.service';
import { parseTimeToMinutes } from '../common/time-window.util';

/**
 * Optional scheduled quick scan of every non-paused source, so new files
 * show up without requiring a manual "Neu scannen" click. Off by default —
 * see Settings.autoRescanEnabled/autoRescanTime/autoRescanFrequency. Unlike
 * the full manual rescan, the quick scan compares filenames only (no
 * hash/timestamp/size) and never prunes deleted files, so it stays cheap on
 * large libraries.
 */
@Injectable()
export class AutoRescanService {
  private readonly logger = new Logger(AutoRescanService.name);
  private lastRunKey: string | null = null;

  constructor(
    @InjectRepository(Source) private readonly sourceRepo: Repository<Source>,
    @InjectRepository(Settings) private readonly settingsRepo: Repository<Settings>,
    private readonly scanService: ScanService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledQuickScan(): Promise<void> {
    const settings = await this.settingsRepo.findOneBy({ id: 1 });
    if (!settings?.autoRescanEnabled) return;

    const targetMinutes = parseTimeToMinutes(
      settings.autoRescanTime ?? '04:00',
    );
    if (targetMinutes === null) return;

    const now = new Date();
    const nowMinutes = this.minutesInTimeZone(now, settings.scheduleTimezone);
    if (nowMinutes !== targetMinutes) return;

    if (
      (settings.autoRescanFrequency ?? 'daily') === 'weekly' &&
      this.isoWeekdayInTimeZone(now, settings.scheduleTimezone) !==
        (settings.autoRescanWeekday ?? 1)
    ) {
      return;
    }

    // The cron fires once per minute, but guard against a duplicate trigger
    // (e.g. overlapping scheduler ticks) running the scan twice per day.
    const runKey = `${this.dateKeyInTimeZone(now, settings.scheduleTimezone)}:${targetMinutes}`;
    if (this.lastRunKey === runKey) return;
    this.lastRunKey = runKey;

    await this.runQuickScan();
  }

  /** Runs the quick scan now and records its statistics. Returns added paths. */
  async runQuickScan(): Promise<string[]> {
    const sources = await this.sourceRepo.find({ where: { paused: false } });
    this.logger.log(
      `Scheduled quick scan: scanning ${sources.length} non-paused source(s)`,
    );
    const addedFiles: string[] = [];
    for (const source of sources) {
      addedFiles.push(...(await this.scanService.quickScanSource(source.id)));
    }
    addedFiles.sort();
    await this.settingsRepo.update(
      { id: 1 },
      {
        lastQuickScanAt: new Date(),
        lastQuickScanAdded: addedFiles.length,
        lastQuickScanFiles: JSON.stringify(addedFiles),
      },
    );
    this.logger.log(
      `Scheduled quick scan finished: ${addedFiles.length} file(s) added`,
    );
    return addedFiles;
  }

  private minutesInTimeZone(now: Date, timeZone: string | null): number {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone ?? undefined,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) {
      return now.getHours() * 60 + now.getMinutes();
    }
    return hour * 60 + minute;
  }

  /** ISO weekday in the configured timezone: 1 = Monday … 7 = Sunday. */
  private isoWeekdayInTimeZone(now: Date, timeZone: string | null): number {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone ?? undefined,
      weekday: 'short',
    }).format(now);
    const map: Record<string, number> = {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    };
    return map[weekday] ?? 1;
  }

  private dateKeyInTimeZone(now: Date, timeZone: string | null): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timeZone ?? undefined,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  }
}

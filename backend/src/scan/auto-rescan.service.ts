import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Source } from '../sources/source.entity';
import { Settings } from '../settings/settings.entity';
import { ScanService } from './scan.service';

/**
 * Optional daily rescan of every non-paused source, so new files show up
 * without requiring a manual "Neu scannen" click. Off by default — see
 * Settings.autoRescanEnabled. Reuses the exact same fire-and-forget
 * ScanService.triggerScan() path as a manual rescan.
 */
@Injectable()
export class AutoRescanService {
  private readonly logger = new Logger(AutoRescanService.name);

  constructor(
    @InjectRepository(Source) private readonly sourceRepo: Repository<Source>,
    @InjectRepository(Settings) private readonly settingsRepo: Repository<Settings>,
    private readonly scanService: ScanService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleDailyAutoRescan(): Promise<void> {
    const settings = await this.settingsRepo.findOneBy({ id: 1 });
    if (!settings?.autoRescanEnabled) return;

    const sources = await this.sourceRepo.find({ where: { paused: false } });
    this.logger.log(`Automatic rescan: triggering ${sources.length} non-paused source(s)`);
    for (const source of sources) {
      this.scanService.triggerScan(source.id);
    }
  }
}

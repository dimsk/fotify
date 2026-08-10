import { Controller, Param, ParseIntPipe, Post, Sse } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { ScanService } from './scan.service';
import { AutoRescanService } from './auto-rescan.service';

@Controller('sources')
export class ScanController {
  constructor(
    private readonly scanService: ScanService,
    private readonly autoRescanService: AutoRescanService,
  ) {}

  @Sse(':id/scan-progress')
  async scanProgress(@Param('id', ParseIntPipe) id: number): Promise<Observable<MessageEvent>> {
    const progress$ = await this.scanService.progress$(id);
    return progress$.pipe(map((event) => ({ data: event }) as MessageEvent));
  }

  /** Quick-scan a single source now (filename-only, adds missing files). */
  @Post(':id/quick-scan')
  async quickScan(@Param('id', ParseIntPipe) id: number) {
    const added = await this.scanService.quickScanSource(id);
    return { added: added.length, files: added };
  }

  /** Quick-scan all non-paused sources now and record the statistics. */
  @Post('/quick-scan-all')
  async quickScanAll() {
    const added = await this.autoRescanService.runQuickScan();
    return { added: added.length, files: added };
  }
}

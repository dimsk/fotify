import { Controller, Param, ParseIntPipe, Sse } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { ScanService } from './scan.service';

@Controller('sources')
export class ScanController {
  constructor(private readonly scanService: ScanService) {}

  @Sse(':id/scan-progress')
  async scanProgress(@Param('id', ParseIntPipe) id: number): Promise<Observable<MessageEvent>> {
    const progress$ = await this.scanService.progress$(id);
    return progress$.pipe(map((event) => ({ data: event }) as MessageEvent));
  }
}

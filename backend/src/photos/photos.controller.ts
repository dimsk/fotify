import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { PhotosService } from './photos.service';
import { SlideshowStateService } from './slideshow-state.service';
import { StatisticsService } from './statistics.service';
import { ScanService } from '../scan/scan.service';
import { SlideshowPresenceDto } from './slideshow-presence.dto';

@Controller('photos')
export class PhotosController {
  constructor(
    private readonly photosService: PhotosService,
    private readonly slideshowStateService: SlideshowStateService,
    private readonly statisticsService: StatisticsService,
    private readonly scanService: ScanService,
  ) {}

  /**
   * The single source of truth for "what should be showing right now" —
   * every device polls this and renders exactly what it says, so all of
   * them stay in sync. All slide-selection logic lives server-side in
   * SlideshowStateService; this route does no picking of its own.
   */
  @Get('current-slide')
  currentSlide() {
    return this.slideshowStateService.getCurrentState();
  }

  @Post('slideshow-heartbeat')
  @HttpCode(204)
  slideshowHeartbeat(@Body() dto: SlideshowPresenceDto) {
    return this.slideshowStateService.recordClientHeartbeat(dto.clientId);
  }

  @Post('slideshow-disconnect')
  @HttpCode(204)
  slideshowDisconnect(@Body() dto: SlideshowPresenceDto) {
    this.slideshowStateService.removeClient(dto.clientId);
  }

  @Get('stats')
  stats() {
    return this.photosService.stats();
  }

  @Get('statistics')
  statistics() {
    return this.statisticsService.getStatistics();
  }

  @Get(':id/actions')
  actions(@Param('id', ParseIntPipe) id: number) {
    return this.photosService.getActionState(id);
  }

  @Post(':id/favorite')
  favorite(@Param('id', ParseIntPipe) id: number) {
    return this.photosService.favorite(id);
  }

  @Post(':id/hide')
  hide(@Param('id', ParseIntPipe) id: number) {
    return this.photosService.hide(id);
  }

  /** Fire-and-forget: re-reads every photo imported before the location feature existed to fill in GPS/city/country. */
  @Post('backfill-locations')
  @HttpCode(202)
  backfillLocations() {
    this.scanService.triggerLocationBackfill();
  }

  /** Fire-and-forget: re-reads every photo imported before the lens/aperture feature existed to fill in lens model/aperture. */
  @Post('backfill-lens-aperture')
  @HttpCode(202)
  backfillLensAperture() {
    this.scanService.triggerLensApertureBackfill();
  }
}

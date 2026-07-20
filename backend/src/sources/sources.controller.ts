import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { SourcesService } from './sources.service';
import { CreateSourceDto } from './create-source.dto';
import { BrowseLocalDto, BrowseSmbDto } from './browse.dto';

@Controller('sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Get()
  list() {
    return this.sourcesService.list();
  }

  @Post()
  create(@Body() dto: CreateSourceDto) {
    return this.sourcesService.create(dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number) {
    await this.sourcesService.remove(id);
  }

  @Post(':id/rescan')
  @HttpCode(202)
  async rescan(@Param('id', ParseIntPipe) id: number) {
    await this.sourcesService.rescan(id);
  }

  @Post(':id/backfill-locations')
  @HttpCode(202)
  async backfillLocations(@Param('id', ParseIntPipe) id: number) {
    await this.sourcesService.backfillLocations(id);
  }

  @Post(':id/backfill-lens-aperture')
  @HttpCode(202)
  async backfillLensAperture(@Param('id', ParseIntPipe) id: number) {
    await this.sourcesService.backfillLensAperture(id);
  }

  @Post(':id/pause')
  @HttpCode(204)
  async pause(@Param('id', ParseIntPipe) id: number) {
    await this.sourcesService.setPaused(id, true);
  }

  @Post(':id/resume')
  @HttpCode(204)
  async resume(@Param('id', ParseIntPipe) id: number) {
    await this.sourcesService.setPaused(id, false);
  }

  @Post('browse/local')
  @HttpCode(HttpStatus.OK)
  browseLocal(@Body() dto: BrowseLocalDto) {
    return this.sourcesService.browseLocal(dto.path);
  }

  @Post('browse/smb')
  @HttpCode(HttpStatus.OK)
  browseSmb(@Body() dto: BrowseSmbDto) {
    return this.sourcesService.browseSmb(dto);
  }
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Settings } from './settings.entity';
import { UpdateSettingsDto } from './update-settings.dto';

const SETTINGS_ID = 1;

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(Settings) private readonly settingsRepo: Repository<Settings>,
  ) {}

  async get(): Promise<Settings> {
    let settings = await this.settingsRepo.findOneBy({ id: SETTINGS_ID });
    if (!settings) {
      settings = this.settingsRepo.create({ id: SETTINGS_ID });
      await this.settingsRepo.save(settings);
    }
    return settings;
  }

  async update(dto: UpdateSettingsDto): Promise<Settings> {
    const settings = await this.get();
    Object.assign(settings, dto);
    return this.settingsRepo.save(settings);
  }
}

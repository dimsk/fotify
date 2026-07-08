import { Injectable, Logger } from '@nestjs/common';
import { join } from 'path';
import geocoder, { AddressObject } from 'local-reverse-geocoder';
import { getDataDir } from '../common/data-dir.util';

export interface ResolvedLocation {
  city: string;
  country: string;
}

const REGION_NAMES = new Intl.DisplayNames(['de'], { type: 'region' });

/**
 * Wraps local-reverse-geocoder (GeoNames-based, fully offline after its
 * one-time data download) to turn GPS coordinates into a city + country
 * name — no per-lookup network call and no external API rate limits, which
 * matters both for scanning large libraries and for the bulk location
 * backfill (see ScanService.triggerLocationBackfill).
 */
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private initPromise: Promise<void> | null = null;

  private ensureInit(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = new Promise((resolve) => {
        this.logger.log('Initializing reverse geocoder (downloads GeoNames data on first run)...');
        geocoder.init(
          {
            dumpDirectory: join(getDataDir(), 'geonames'),
            // Only city name + country code are used (see resolve()) — admin
            // region names and alternate-name translations are much larger
            // downloads (alternateNames.zip alone is 200MB+) that would only
            // slow down first-run init for data this app never reads.
            load: { admin1: false, admin2: false, admin3And4: false, alternateNames: false },
          },
          () => {
            this.logger.log('Reverse geocoder ready');
            resolve();
          },
        );
      });
    }
    return this.initPromise;
  }

  async resolve(latitude: number, longitude: number): Promise<ResolvedLocation | null> {
    try {
      await this.ensureInit();
      const [results] = await new Promise<AddressObject[][]>((resolve, reject) => {
        geocoder.lookUp({ latitude, longitude }, 1, (err, res) => (err ? reject(err) : resolve(res)));
      });
      const best = results?.[0];
      if (!best) return null;
      return { city: best.name, country: REGION_NAMES.of(best.countryCode) ?? best.countryCode };
    } catch (err) {
      this.logger.warn(
        `Reverse geocoding failed for ${latitude},${longitude}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }
}

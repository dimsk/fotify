import { MigrationInterface, QueryRunner } from 'typeorm';

export class SlideshowZoomSetting1783432000000 implements MigrationInterface {
  name = 'SlideshowZoomSetting1783432000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('settings', 'slideshowZoom');
    if (!hasColumn) {
      await queryRunner.query(`ALTER TABLE "settings" ADD "slideshowZoom" real NOT NULL DEFAULT (1)`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('settings', 'slideshowZoom');
    if (!hasColumn) return;

    await queryRunner.query(`ALTER TABLE "settings" RENAME TO "temporary_settings"`);
    await queryRunner.query(`CREATE TABLE "settings" ("id" integer PRIMARY KEY NOT NULL DEFAULT (1), "language" text NOT NULL DEFAULT ('en'), "clientPresenceDetectionEnabled" boolean NOT NULL DEFAULT (1), "scheduleTimezone" text NOT NULL DEFAULT ('Europe/Berlin'), "transitionEffects" text NOT NULL DEFAULT ('fade'), "transitionDurationMs" integer NOT NULL DEFAULT (1200), "imageDurationMs" integer NOT NULL DEFAULT (6000), "avoidRepeats" boolean NOT NULL DEFAULT (0), "shuffleMode" text NOT NULL DEFAULT ('all'), "rotationSourceId" integer, "rotationStartedAt" datetime, "cinematicChance" integer NOT NULL DEFAULT (0), "adjacentPortraitTriples" boolean NOT NULL DEFAULT (1), "photoFrameStyle" text NOT NULL DEFAULT ('none'), "photoCaptionPosition" text NOT NULL DEFAULT ('bottom-right'), "grainEffect" text NOT NULL DEFAULT ('none'), "nightModeEnabled" boolean NOT NULL DEFAULT (0), "nightModeStart" text NOT NULL DEFAULT ('22:00'), "nightModeEnd" text NOT NULL DEFAULT ('07:00'), "calendarOverlayEnabled" boolean NOT NULL DEFAULT (0), "calendarOverlayStart" text NOT NULL DEFAULT ('07:00'), "calendarOverlayEnd" text NOT NULL DEFAULT ('22:00'), "dateOverlayEnabled" boolean NOT NULL DEFAULT (0), "dateOverlayMode" text NOT NULL DEFAULT ('always'), "weatherOverlayEnabled" boolean NOT NULL DEFAULT (0), "weatherOverlayMode" text NOT NULL DEFAULT ('always'), "weatherForecastDays" integer NOT NULL DEFAULT (4), "weatherLocationId" integer, "weatherLocationName" text, "weatherLocationAdmin1" text, "weatherLocationCountry" text, "weatherLatitude" real, "weatherLongitude" real, "weatherTimezone" text, "autoRescanEnabled" boolean NOT NULL DEFAULT (0), "collageEnabled" boolean NOT NULL DEFAULT (0), "collageChance" integer NOT NULL DEFAULT (20), "collageTimeWindowMinutes" integer NOT NULL DEFAULT (180), "collageLayouts" text NOT NULL DEFAULT ('random'))`);
    await queryRunner.query(`INSERT INTO "settings"("id", "language", "clientPresenceDetectionEnabled", "scheduleTimezone", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle", "photoCaptionPosition", "grainEffect", "nightModeEnabled", "nightModeStart", "nightModeEnd", "calendarOverlayEnabled", "calendarOverlayStart", "calendarOverlayEnd", "dateOverlayEnabled", "dateOverlayMode", "weatherOverlayEnabled", "weatherOverlayMode", "weatherForecastDays", "weatherLocationId", "weatherLocationName", "weatherLocationAdmin1", "weatherLocationCountry", "weatherLatitude", "weatherLongitude", "weatherTimezone", "autoRescanEnabled", "collageEnabled", "collageChance", "collageTimeWindowMinutes", "collageLayouts") SELECT "id", "language", "clientPresenceDetectionEnabled", "scheduleTimezone", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle", "photoCaptionPosition", "grainEffect", "nightModeEnabled", "nightModeStart", "nightModeEnd", "calendarOverlayEnabled", "calendarOverlayStart", "calendarOverlayEnd", "dateOverlayEnabled", "dateOverlayMode", "weatherOverlayEnabled", "weatherOverlayMode", "weatherForecastDays", "weatherLocationId", "weatherLocationName", "weatherLocationAdmin1", "weatherLocationCountry", "weatherLatitude", "weatherLongitude", "weatherTimezone", "autoRescanEnabled", "collageEnabled", "collageChance", "collageTimeWindowMinutes", "collageLayouts" FROM "temporary_settings"`);
    await queryRunner.query(`DROP TABLE "temporary_settings"`);
  }
}

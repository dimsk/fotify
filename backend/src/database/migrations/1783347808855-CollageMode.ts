import { MigrationInterface, QueryRunner } from "typeorm";

export class CollageMode1783347808855 implements MigrationInterface {
    name = 'CollageMode1783347808855'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "temporary_settings" ("id" integer PRIMARY KEY NOT NULL DEFAULT (1), "transitionEffects" text NOT NULL DEFAULT ('fade'), "transitionDurationMs" integer NOT NULL DEFAULT (1200), "imageDurationMs" integer NOT NULL DEFAULT (6000), "avoidRepeats" boolean NOT NULL DEFAULT (0), "shuffleMode" text NOT NULL DEFAULT ('all'), "rotationSourceId" integer, "rotationStartedAt" datetime, "cinematicChance" integer NOT NULL DEFAULT (0), "adjacentPortraitTriples" boolean NOT NULL DEFAULT (1), "photoFrameStyle" text NOT NULL DEFAULT ('none'), "nightModeEnabled" boolean NOT NULL DEFAULT (0), "nightModeStart" text NOT NULL DEFAULT ('22:00'), "nightModeEnd" text NOT NULL DEFAULT ('07:00'), "autoRescanEnabled" boolean NOT NULL DEFAULT (0), "collageEnabled" boolean NOT NULL DEFAULT (0), "collageChance" integer NOT NULL DEFAULT (20), "collageTimeWindowMinutes" integer NOT NULL DEFAULT (180), "collageMinPhotos" integer NOT NULL DEFAULT (3), "collageMaxPhotos" integer NOT NULL DEFAULT (5))`);
        await queryRunner.query(`INSERT INTO "temporary_settings"("id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle", "nightModeEnabled", "nightModeStart", "nightModeEnd", "autoRescanEnabled") SELECT "id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle", "nightModeEnabled", "nightModeStart", "nightModeEnd", "autoRescanEnabled" FROM "settings"`);
        await queryRunner.query(`DROP TABLE "settings"`);
        await queryRunner.query(`ALTER TABLE "temporary_settings" RENAME TO "settings"`);
        // queued_slide holds at most LOOKAHEAD_DEPTH (10) rows and is purely
        // ephemeral — fully rebuilt by SlideshowStateService within
        // milliseconds of every boot — so unlike settings (a real singleton
        // row), there's nothing worth preserving across this shape change.
        // Dropping and recreating is simpler than trying to carry
        // photoId1/2/3 values into the new photoIds column.
        await queryRunner.query(`DROP TABLE "queued_slide"`);
        await queryRunner.query(`CREATE TABLE "queued_slide" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "type" varchar NOT NULL, "photoIds" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "queued_slide"`);
        await queryRunner.query(`CREATE TABLE "queued_slide" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "type" varchar NOT NULL, "photoId1" integer NOT NULL, "photoId2" integer, "photoId3" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`ALTER TABLE "settings" RENAME TO "temporary_settings"`);
        await queryRunner.query(`CREATE TABLE "settings" ("id" integer PRIMARY KEY NOT NULL DEFAULT (1), "transitionEffects" text NOT NULL DEFAULT ('fade'), "transitionDurationMs" integer NOT NULL DEFAULT (1200), "imageDurationMs" integer NOT NULL DEFAULT (6000), "avoidRepeats" boolean NOT NULL DEFAULT (0), "shuffleMode" text NOT NULL DEFAULT ('all'), "rotationSourceId" integer, "rotationStartedAt" datetime, "cinematicChance" integer NOT NULL DEFAULT (0), "adjacentPortraitTriples" boolean NOT NULL DEFAULT (1), "photoFrameStyle" text NOT NULL DEFAULT ('none'), "nightModeEnabled" boolean NOT NULL DEFAULT (0), "nightModeStart" text NOT NULL DEFAULT ('22:00'), "nightModeEnd" text NOT NULL DEFAULT ('07:00'), "autoRescanEnabled" boolean NOT NULL DEFAULT (0))`);
        await queryRunner.query(`INSERT INTO "settings"("id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle", "nightModeEnabled", "nightModeStart", "nightModeEnd", "autoRescanEnabled") SELECT "id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle", "nightModeEnabled", "nightModeStart", "nightModeEnd", "autoRescanEnabled" FROM "temporary_settings"`);
        await queryRunner.query(`DROP TABLE "temporary_settings"`);
    }

}

import { MigrationInterface, QueryRunner } from "typeorm";

export class GrainEffect1783350810000 implements MigrationInterface {
    name = 'GrainEffect1783350810000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settings" ADD "grainEffect" text NOT NULL DEFAULT ('none')`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settings" RENAME TO "temporary_settings"`);
        await queryRunner.query(`CREATE TABLE "settings" ("id" integer PRIMARY KEY NOT NULL DEFAULT (1), "transitionEffects" text NOT NULL DEFAULT ('fade'), "transitionDurationMs" integer NOT NULL DEFAULT (1200), "imageDurationMs" integer NOT NULL DEFAULT (6000), "avoidRepeats" boolean NOT NULL DEFAULT (0), "shuffleMode" text NOT NULL DEFAULT ('all'), "rotationSourceId" integer, "rotationStartedAt" datetime, "cinematicChance" integer NOT NULL DEFAULT (0), "adjacentPortraitTriples" boolean NOT NULL DEFAULT (1), "photoFrameStyle" text NOT NULL DEFAULT ('none'), "nightModeEnabled" boolean NOT NULL DEFAULT (0), "nightModeStart" text NOT NULL DEFAULT ('22:00'), "nightModeEnd" text NOT NULL DEFAULT ('07:00'), "autoRescanEnabled" boolean NOT NULL DEFAULT (0), "collageEnabled" boolean NOT NULL DEFAULT (0), "collageChance" integer NOT NULL DEFAULT (20), "collageTimeWindowMinutes" integer NOT NULL DEFAULT (180), "collageLayouts" text NOT NULL DEFAULT ('random'))`);
        await queryRunner.query(`INSERT INTO "settings"("id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle", "nightModeEnabled", "nightModeStart", "nightModeEnd", "autoRescanEnabled", "collageEnabled", "collageChance", "collageTimeWindowMinutes", "collageLayouts") SELECT "id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle", "nightModeEnabled", "nightModeStart", "nightModeEnd", "autoRescanEnabled", "collageEnabled", "collageChance", "collageTimeWindowMinutes", "collageLayouts" FROM "temporary_settings"`);
        await queryRunner.query(`DROP TABLE "temporary_settings"`);
    }

}

import { MigrationInterface, QueryRunner } from "typeorm";

export class ScheduleSettings1783347399963 implements MigrationInterface {
    name = 'ScheduleSettings1783347399963'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "temporary_settings" ("id" integer PRIMARY KEY NOT NULL DEFAULT (1), "transitionEffects" text NOT NULL DEFAULT ('fade'), "transitionDurationMs" integer NOT NULL DEFAULT (1200), "imageDurationMs" integer NOT NULL DEFAULT (6000), "avoidRepeats" boolean NOT NULL DEFAULT (0), "shuffleMode" text NOT NULL DEFAULT ('all'), "rotationSourceId" integer, "rotationStartedAt" datetime, "cinematicChance" integer NOT NULL DEFAULT (0), "adjacentPortraitTriples" boolean NOT NULL DEFAULT (1), "photoFrameStyle" text NOT NULL DEFAULT ('none'), "nightModeEnabled" boolean NOT NULL DEFAULT (0), "nightModeStart" text NOT NULL DEFAULT ('22:00'), "nightModeEnd" text NOT NULL DEFAULT ('07:00'), "autoRescanEnabled" boolean NOT NULL DEFAULT (0))`);
        await queryRunner.query(`INSERT INTO "temporary_settings"("id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle") SELECT "id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle" FROM "settings"`);
        await queryRunner.query(`DROP TABLE "settings"`);
        await queryRunner.query(`ALTER TABLE "temporary_settings" RENAME TO "settings"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settings" RENAME TO "temporary_settings"`);
        await queryRunner.query(`CREATE TABLE "settings" ("id" integer PRIMARY KEY NOT NULL DEFAULT (1), "transitionEffects" text NOT NULL DEFAULT ('fade'), "transitionDurationMs" integer NOT NULL DEFAULT (1200), "imageDurationMs" integer NOT NULL DEFAULT (6000), "avoidRepeats" boolean NOT NULL DEFAULT (0), "shuffleMode" text NOT NULL DEFAULT ('all'), "rotationSourceId" integer, "rotationStartedAt" datetime, "cinematicChance" integer NOT NULL DEFAULT (0), "adjacentPortraitTriples" boolean NOT NULL DEFAULT (1), "photoFrameStyle" text NOT NULL DEFAULT ('none'))`);
        await queryRunner.query(`INSERT INTO "settings"("id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle") SELECT "id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle" FROM "temporary_settings"`);
        await queryRunner.query(`DROP TABLE "temporary_settings"`);
    }

}

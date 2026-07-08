import { MigrationInterface, QueryRunner } from "typeorm";

export class MultiEffectSettings1783340469596 implements MigrationInterface {
    name = 'MultiEffectSettings1783340469596'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "temporary_settings" ("id" integer PRIMARY KEY NOT NULL DEFAULT (1), "transitionEffects" text NOT NULL DEFAULT ('fade'), "transitionDurationMs" integer NOT NULL DEFAULT (1200), "imageDurationMs" integer NOT NULL DEFAULT (6000), "avoidRepeats" boolean NOT NULL DEFAULT (0), "shuffleMode" text NOT NULL DEFAULT ('all'), "rotationSourceId" integer, "rotationStartedAt" datetime)`);
        await queryRunner.query(`INSERT INTO "temporary_settings"("id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt") SELECT "id", "transitionEffect", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt" FROM "settings"`);
        await queryRunner.query(`DROP TABLE "settings"`);
        await queryRunner.query(`ALTER TABLE "temporary_settings" RENAME TO "settings"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "settings" RENAME TO "temporary_settings"`);
        await queryRunner.query(`CREATE TABLE "settings" ("id" integer PRIMARY KEY NOT NULL DEFAULT (1), "transitionEffect" text NOT NULL DEFAULT ('fade'), "transitionDurationMs" integer NOT NULL DEFAULT (1200), "imageDurationMs" integer NOT NULL DEFAULT (6000), "avoidRepeats" boolean NOT NULL DEFAULT (0), "shuffleMode" text NOT NULL DEFAULT ('all'), "rotationSourceId" integer, "rotationStartedAt" datetime)`);
        await queryRunner.query(`INSERT INTO "settings"("id", "transitionEffect", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt") SELECT "id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt" FROM "temporary_settings"`);
        await queryRunner.query(`DROP TABLE "temporary_settings"`);
    }

}

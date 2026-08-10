import { MigrationInterface, QueryRunner } from 'typeorm';

export class VideoMedia1783438000000 implements MigrationInterface {
  name = 'VideoMedia1783438000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "photo" ADD COLUMN "mediaType" text NOT NULL DEFAULT ('image')`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo" ADD COLUMN "durationMs" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo" ADD COLUMN "mimeType" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo" ADD COLUMN "videoCodec" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo" ADD COLUMN "videoContainer" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo" ADD COLUMN "sourceFileSize" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo" ADD COLUMN "sourceModifiedAt" datetime`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo" ADD COLUMN "cachedVideoMode" text`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_photo_media_type" ON "photo" ("mediaType")`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "videoCompatibilityMode" text NOT NULL DEFAULT ('normalize')`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "videoDurationMode" text NOT NULL DEFAULT ('full')`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "videoMaxDurationMs" integer NOT NULL DEFAULT (30000)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "videoMaxDurationMs"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "videoDurationMode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "videoCompatibilityMode"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_photo_media_type"`);
    await queryRunner.query(`ALTER TABLE "photo" DROP COLUMN "cachedVideoMode"`);
    await queryRunner.query(
      `ALTER TABLE "photo" DROP COLUMN "sourceModifiedAt"`,
    );
    await queryRunner.query(`ALTER TABLE "photo" DROP COLUMN "sourceFileSize"`);
    await queryRunner.query(`ALTER TABLE "photo" DROP COLUMN "videoContainer"`);
    await queryRunner.query(`ALTER TABLE "photo" DROP COLUMN "videoCodec"`);
    await queryRunner.query(`ALTER TABLE "photo" DROP COLUMN "mimeType"`);
    await queryRunner.query(`ALTER TABLE "photo" DROP COLUMN "durationMs"`);
    await queryRunner.query(`ALTER TABLE "photo" DROP COLUMN "mediaType"`);
  }
}

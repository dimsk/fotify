import { MigrationInterface, QueryRunner } from 'typeorm';

export class VideoRandomSegment1783446000000 implements MigrationInterface {
  name = 'VideoRandomSegment1783446000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "videoRandomSegmentEnabled" boolean NOT NULL DEFAULT (0)`,
    );
    // The old 'random-segment' duration mode folded the two concerns
    // together; preserve its behavior by enabling the new toggle and
    // normalizing the now-removed enum value to the equivalent duration mode.
    await queryRunner.query(
      `UPDATE "settings" SET "videoRandomSegmentEnabled" = 1, "videoDurationMode" = 'photo' WHERE "videoDurationMode" = 'random-segment'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "videoRandomSegmentEnabled"`,
    );
  }
}

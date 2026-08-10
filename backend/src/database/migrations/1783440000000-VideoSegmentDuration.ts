import { MigrationInterface, QueryRunner } from 'typeorm';

export class VideoSegmentDuration1783440000000 implements MigrationInterface {
  name = 'VideoSegmentDuration1783440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "queued_slide" ADD COLUMN "videoSegmentDurationMs" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "queued_slide" DROP COLUMN "videoSegmentDurationMs"`,
    );
  }
}

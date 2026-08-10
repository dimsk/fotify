import { MigrationInterface, QueryRunner } from 'typeorm';

export class RandomVideoSegment1783439000000 implements MigrationInterface {
  name = 'RandomVideoSegment1783439000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "queued_slide" ADD COLUMN "videoStartOffsetMs" integer`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "queued_slide" DROP COLUMN "videoStartOffsetMs"`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class PlaybackMode1783445000000 implements MigrationInterface {
  name = 'PlaybackMode1783445000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "playbackMode" text NOT NULL DEFAULT ('all')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "playbackMode"`,
    );
  }
}

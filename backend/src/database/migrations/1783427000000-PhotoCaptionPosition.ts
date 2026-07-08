import { MigrationInterface, QueryRunner } from 'typeorm';

export class PhotoCaptionPosition1783427000000 implements MigrationInterface {
  name = 'PhotoCaptionPosition1783427000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "photoCaptionPosition" text NOT NULL DEFAULT ('bottom-right')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "photoCaptionPosition"`,
    );
  }
}

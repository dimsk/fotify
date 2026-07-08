import { MigrationInterface, QueryRunner } from 'typeorm';

export class DateOverlaySettings1783426000000 implements MigrationInterface {
  name = 'DateOverlaySettings1783426000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "dateOverlayEnabled" boolean NOT NULL DEFAULT (0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "dateOverlayMode" text NOT NULL DEFAULT ('always')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "dateOverlayMode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "dateOverlayEnabled"`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CalendarSyncIntervalSetting1783434000000 implements MigrationInterface {
  name = 'CalendarSyncIntervalSetting1783434000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "calendarSyncIntervalMinutes" integer NOT NULL DEFAULT (15)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "calendarSyncIntervalMinutes"`);
  }
}

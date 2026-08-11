import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Repair migration: the SchedulerQuickScan migration was marked as executed
 * in existing databases while its frequency/weekday/file-list columns were
 * missing (an upgrade raced an older build that had already recorded it).
 * SQLite has no ADD COLUMN IF NOT EXISTS, so each addition is guarded by a
 * table-info check — a no-op wherever the column already exists.
 */
export class SchedulerQuickScanRepair1783443000000 implements MigrationInterface {
  name = 'SchedulerQuickScanRepair1783443000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = (await queryRunner.query(`PRAGMA table_info("settings")`)) as
      | { name: string }[]
      | undefined;
    const present = new Set((columns ?? []).map((column) => column.name));

    if (!present.has('autoRescanFrequency')) {
      await queryRunner.query(
        `ALTER TABLE "settings" ADD COLUMN "autoRescanFrequency" text NOT NULL DEFAULT ('daily')`,
      );
    }
    if (!present.has('autoRescanWeekday')) {
      await queryRunner.query(
        `ALTER TABLE "settings" ADD COLUMN "autoRescanWeekday" integer NOT NULL DEFAULT (1)`,
      );
    }
    if (!present.has('lastQuickScanFiles')) {
      await queryRunner.query(
        `ALTER TABLE "settings" ADD COLUMN "lastQuickScanFiles" text`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Deliberately empty: dropping these columns would break installations
    // where the original migration applied them correctly.
  }
}

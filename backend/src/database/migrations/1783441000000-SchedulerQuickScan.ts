import { MigrationInterface, QueryRunner } from 'typeorm';

export class SchedulerQuickScan1783441000000 implements MigrationInterface {
  name = 'SchedulerQuickScan1783441000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "autoRescanTime" text NOT NULL DEFAULT ('04:00')`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "autoRescanFrequency" text NOT NULL DEFAULT ('daily')`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "autoRescanWeekday" integer NOT NULL DEFAULT (1)`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "lastQuickScanAt" datetime`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "lastQuickScanAdded" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "lastQuickScanFiles" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "autoRescanTime"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "autoRescanFrequency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "autoRescanWeekday"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "lastQuickScanAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "lastQuickScanAdded"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "lastQuickScanFiles"`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class WeatherRefreshIntervalSetting1783435000000 implements MigrationInterface {
  name = 'WeatherRefreshIntervalSetting1783435000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "weatherRefreshIntervalMinutes" integer NOT NULL DEFAULT (15)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "settings" DROP COLUMN "weatherRefreshIntervalMinutes"`);
  }
}

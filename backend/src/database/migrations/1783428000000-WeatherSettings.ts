import { MigrationInterface, QueryRunner } from 'typeorm';

export class WeatherSettings1783428000000 implements MigrationInterface {
  name = 'WeatherSettings1783428000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "weatherOverlayEnabled" boolean NOT NULL DEFAULT (0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "weatherOverlayMode" text NOT NULL DEFAULT ('always')`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "weatherForecastDays" integer NOT NULL DEFAULT (4)`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "weatherLocationId" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "weatherLocationName" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "weatherLocationAdmin1" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "weatherLocationCountry" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "weatherLatitude" real`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "weatherLongitude" real`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD "weatherTimezone" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "weatherTimezone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "weatherLongitude"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "weatherLatitude"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "weatherLocationCountry"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "weatherLocationAdmin1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "weatherLocationName"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "weatherLocationId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "weatherForecastDays"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "weatherOverlayMode"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "weatherOverlayEnabled"`,
    );
  }
}

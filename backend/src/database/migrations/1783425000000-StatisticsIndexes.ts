import { MigrationInterface, QueryRunner } from 'typeorm';

export class StatisticsIndexes1783425000000 implements MigrationInterface {
  name = 'StatisticsIndexes1783425000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_photo_source_last_shown" ON "photo" ("sourceId", "lastShownAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_photo_gps_coordinates" ON "photo" ("gpsLatitude", "gpsLongitude")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_photo_captured_at" ON "photo" ("capturedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_source_created_at" ON "source" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_source_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_photo_captured_at"`);
    await queryRunner.query(`DROP INDEX "IDX_photo_gps_coordinates"`);
    await queryRunner.query(`DROP INDEX "IDX_photo_source_last_shown"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class PhotoLocationScanned1783424000000 implements MigrationInterface {
  name = 'PhotoLocationScanned1783424000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "photo" ADD "locationScanned" boolean NOT NULL DEFAULT (0)`,
    );
    await queryRunner.query(
      `UPDATE "photo" SET "locationScanned" = 1 WHERE "locationCheckedAt" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_photo_location_scanned" ON "photo" ("locationScanned")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_photo_location_scanned"`);
    await queryRunner.query(`DROP INDEX "IDX_8e897e9fd243f0219eef111c5c"`);
    await queryRunner.query(`DROP INDEX "IDX_3abbb7e3678988112b940a2015"`);
    await queryRunner.query(`DROP INDEX "IDX_40034fe4bbe1dfc8de32096ac4"`);
    await queryRunner.query(`DROP INDEX "IDX_a3ff147169e841d9eb29463c31"`);
    await queryRunner.query(`DROP INDEX "IDX_883e965b05414d6ebc24acfa07"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_photo" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "sourceId" integer NOT NULL, "relativePath" text NOT NULL, "fileHash" text NOT NULL, "width" integer NOT NULL, "height" integer NOT NULL, "orientation" text NOT NULL, "capturedAt" datetime, "cachedDisplayPath" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "lastShownAt" datetime, "cachedAt" datetime, "gpsLatitude" real, "gpsLongitude" real, "locationCity" text, "locationCountry" text, "locationCheckedAt" datetime, CONSTRAINT "FK_40034fe4bbe1dfc8de32096ac4a" FOREIGN KEY ("sourceId") REFERENCES "source" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `INSERT INTO "temporary_photo"("id", "sourceId", "relativePath", "fileHash", "width", "height", "orientation", "capturedAt", "cachedDisplayPath", "createdAt", "lastShownAt", "cachedAt", "gpsLatitude", "gpsLongitude", "locationCity", "locationCountry", "locationCheckedAt") SELECT "id", "sourceId", "relativePath", "fileHash", "width", "height", "orientation", "capturedAt", "cachedDisplayPath", "createdAt", "lastShownAt", "cachedAt", "gpsLatitude", "gpsLongitude", "locationCity", "locationCountry", "locationCheckedAt" FROM "photo"`,
    );
    await queryRunner.query(`DROP TABLE "photo"`);
    await queryRunner.query(`ALTER TABLE "temporary_photo" RENAME TO "photo"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_8e897e9fd243f0219eef111c5c" ON "photo" ("cachedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3abbb7e3678988112b940a2015" ON "photo" ("lastShownAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_40034fe4bbe1dfc8de32096ac4" ON "photo" ("sourceId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a3ff147169e841d9eb29463c31" ON "photo" ("fileHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_883e965b05414d6ebc24acfa07" ON "photo" ("orientation")`,
    );
  }
}

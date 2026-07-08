import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1783265469029 implements MigrationInterface {
    name = 'InitialSchema1783265469029'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "photo" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "sourceId" integer NOT NULL, "relativePath" text NOT NULL, "fileHash" text NOT NULL, "width" integer NOT NULL, "height" integer NOT NULL, "orientation" text NOT NULL, "capturedAt" datetime, "cachedDisplayPath" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_40034fe4bbe1dfc8de32096ac4" ON "photo" ("sourceId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a3ff147169e841d9eb29463c31" ON "photo" ("fileHash") `);
        await queryRunner.query(`CREATE INDEX "IDX_883e965b05414d6ebc24acfa07" ON "photo" ("orientation") `);
        await queryRunner.query(`CREATE TABLE "source" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "type" text NOT NULL, "name" text NOT NULL, "localPath" text, "smbHost" text, "smbShare" text, "smbUsername" text, "smbPasswordEnc" text, "smbDomain" text, "smbRootPath" text, "status" text NOT NULL DEFAULT ('idle'), "lastScanError" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE TABLE "settings" ("id" integer PRIMARY KEY NOT NULL DEFAULT (1), "transitionEffect" text NOT NULL DEFAULT ('fade'), "transitionDurationMs" integer NOT NULL DEFAULT (1200), "imageDurationMs" integer NOT NULL DEFAULT (6000))`);
        await queryRunner.query(`DROP INDEX "IDX_40034fe4bbe1dfc8de32096ac4"`);
        await queryRunner.query(`DROP INDEX "IDX_a3ff147169e841d9eb29463c31"`);
        await queryRunner.query(`DROP INDEX "IDX_883e965b05414d6ebc24acfa07"`);
        await queryRunner.query(`CREATE TABLE "temporary_photo" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "sourceId" integer NOT NULL, "relativePath" text NOT NULL, "fileHash" text NOT NULL, "width" integer NOT NULL, "height" integer NOT NULL, "orientation" text NOT NULL, "capturedAt" datetime, "cachedDisplayPath" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_40034fe4bbe1dfc8de32096ac4a" FOREIGN KEY ("sourceId") REFERENCES "source" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_photo"("id", "sourceId", "relativePath", "fileHash", "width", "height", "orientation", "capturedAt", "cachedDisplayPath", "createdAt") SELECT "id", "sourceId", "relativePath", "fileHash", "width", "height", "orientation", "capturedAt", "cachedDisplayPath", "createdAt" FROM "photo"`);
        await queryRunner.query(`DROP TABLE "photo"`);
        await queryRunner.query(`ALTER TABLE "temporary_photo" RENAME TO "photo"`);
        await queryRunner.query(`CREATE INDEX "IDX_40034fe4bbe1dfc8de32096ac4" ON "photo" ("sourceId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a3ff147169e841d9eb29463c31" ON "photo" ("fileHash") `);
        await queryRunner.query(`CREATE INDEX "IDX_883e965b05414d6ebc24acfa07" ON "photo" ("orientation") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_883e965b05414d6ebc24acfa07"`);
        await queryRunner.query(`DROP INDEX "IDX_a3ff147169e841d9eb29463c31"`);
        await queryRunner.query(`DROP INDEX "IDX_40034fe4bbe1dfc8de32096ac4"`);
        await queryRunner.query(`ALTER TABLE "photo" RENAME TO "temporary_photo"`);
        await queryRunner.query(`CREATE TABLE "photo" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "sourceId" integer NOT NULL, "relativePath" text NOT NULL, "fileHash" text NOT NULL, "width" integer NOT NULL, "height" integer NOT NULL, "orientation" text NOT NULL, "capturedAt" datetime, "cachedDisplayPath" text NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "photo"("id", "sourceId", "relativePath", "fileHash", "width", "height", "orientation", "capturedAt", "cachedDisplayPath", "createdAt") SELECT "id", "sourceId", "relativePath", "fileHash", "width", "height", "orientation", "capturedAt", "cachedDisplayPath", "createdAt" FROM "temporary_photo"`);
        await queryRunner.query(`DROP TABLE "temporary_photo"`);
        await queryRunner.query(`CREATE INDEX "IDX_883e965b05414d6ebc24acfa07" ON "photo" ("orientation") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a3ff147169e841d9eb29463c31" ON "photo" ("fileHash") `);
        await queryRunner.query(`CREATE INDEX "IDX_40034fe4bbe1dfc8de32096ac4" ON "photo" ("sourceId") `);
        await queryRunner.query(`DROP TABLE "settings"`);
        await queryRunner.query(`DROP TABLE "source"`);
        await queryRunner.query(`DROP INDEX "IDX_883e965b05414d6ebc24acfa07"`);
        await queryRunner.query(`DROP INDEX "IDX_a3ff147169e841d9eb29463c31"`);
        await queryRunner.query(`DROP INDEX "IDX_40034fe4bbe1dfc8de32096ac4"`);
        await queryRunner.query(`DROP TABLE "photo"`);
    }

}

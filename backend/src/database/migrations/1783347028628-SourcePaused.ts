import { MigrationInterface, QueryRunner } from "typeorm";

export class SourcePaused1783347028628 implements MigrationInterface {
    name = 'SourcePaused1783347028628'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "temporary_source" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "type" text NOT NULL, "name" text NOT NULL, "localPath" text, "smbHost" text, "smbShare" text, "smbUsername" text, "smbPasswordEnc" text, "smbDomain" text, "smbRootPath" text, "status" text NOT NULL DEFAULT ('idle'), "lastScanError" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "paused" boolean NOT NULL DEFAULT (0))`);
        await queryRunner.query(`INSERT INTO "temporary_source"("id", "type", "name", "localPath", "smbHost", "smbShare", "smbUsername", "smbPasswordEnc", "smbDomain", "smbRootPath", "status", "lastScanError", "createdAt") SELECT "id", "type", "name", "localPath", "smbHost", "smbShare", "smbUsername", "smbPasswordEnc", "smbDomain", "smbRootPath", "status", "lastScanError", "createdAt" FROM "source"`);
        await queryRunner.query(`DROP TABLE "source"`);
        await queryRunner.query(`ALTER TABLE "temporary_source" RENAME TO "source"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "source" RENAME TO "temporary_source"`);
        await queryRunner.query(`CREATE TABLE "source" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "type" text NOT NULL, "name" text NOT NULL, "localPath" text, "smbHost" text, "smbShare" text, "smbUsername" text, "smbPasswordEnc" text, "smbDomain" text, "smbRootPath" text, "status" text NOT NULL DEFAULT ('idle'), "lastScanError" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "source"("id", "type", "name", "localPath", "smbHost", "smbShare", "smbUsername", "smbPasswordEnc", "smbDomain", "smbRootPath", "status", "lastScanError", "createdAt") SELECT "id", "type", "name", "localPath", "smbHost", "smbShare", "smbUsername", "smbPasswordEnc", "smbDomain", "smbRootPath", "status", "lastScanError", "createdAt" FROM "temporary_source"`);
        await queryRunner.query(`DROP TABLE "temporary_source"`);
    }

}

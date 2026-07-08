import { MigrationInterface, QueryRunner } from "typeorm";

export class GoogleOAuthPublicUrl1783417346410 implements MigrationInterface {
    name = 'GoogleOAuthPublicUrl1783417346410'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "temporary_google_o_auth_config" ("id" integer PRIMARY KEY NOT NULL DEFAULT (1), "clientId" text, "clientSecretEnc" text, "publicUrl" text)`);
        await queryRunner.query(`INSERT INTO "temporary_google_o_auth_config"("id", "clientId", "clientSecretEnc") SELECT "id", "clientId", "clientSecretEnc" FROM "google_o_auth_config"`);
        await queryRunner.query(`DROP TABLE "google_o_auth_config"`);
        await queryRunner.query(`ALTER TABLE "temporary_google_o_auth_config" RENAME TO "google_o_auth_config"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "google_o_auth_config" RENAME TO "temporary_google_o_auth_config"`);
        await queryRunner.query(`CREATE TABLE "google_o_auth_config" ("id" integer PRIMARY KEY NOT NULL DEFAULT (1), "clientId" text, "clientSecretEnc" text)`);
        await queryRunner.query(`INSERT INTO "google_o_auth_config"("id", "clientId", "clientSecretEnc") SELECT "id", "clientId", "clientSecretEnc" FROM "temporary_google_o_auth_config"`);
        await queryRunner.query(`DROP TABLE "temporary_google_o_auth_config"`);
    }

}

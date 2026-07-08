import { MigrationInterface, QueryRunner } from "typeorm";

export class GoogleOAuthConfig1783416471993 implements MigrationInterface {
    name = 'GoogleOAuthConfig1783416471993'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "google_o_auth_config" ("id" integer PRIMARY KEY NOT NULL DEFAULT (1), "clientId" text, "clientSecretEnc" text)`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "google_o_auth_config"`);
    }

}

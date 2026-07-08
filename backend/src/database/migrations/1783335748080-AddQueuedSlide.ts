import { MigrationInterface, QueryRunner } from "typeorm";

export class AddQueuedSlide1783335748080 implements MigrationInterface {
    name = 'AddQueuedSlide1783335748080'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "queued_slide" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "type" varchar NOT NULL, "photoId1" integer NOT NULL, "photoId2" integer, "photoId3" integer, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "queued_slide"`);
    }

}

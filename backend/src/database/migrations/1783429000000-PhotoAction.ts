import { MigrationInterface, QueryRunner } from 'typeorm';

export class PhotoAction1783429000000 implements MigrationInterface {
  name = 'PhotoAction1783429000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "photo_action" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "photoId" integer NOT NULL, "favoritedAt" datetime, "hiddenAt" datetime, "downloadCount" integer NOT NULL DEFAULT (0), "lastDownloadedAt" datetime, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "updatedAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_photo_action_photo" FOREIGN KEY ("photoId") REFERENCES "photo" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_photo_action_photo_id" ON "photo_action" ("photoId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_photo_action_hidden_at" ON "photo_action" ("hiddenAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_photo_action_hidden_at"`);
    await queryRunner.query(`DROP INDEX "IDX_photo_action_photo_id"`);
    await queryRunner.query(`DROP TABLE "photo_action"`);
  }
}

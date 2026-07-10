import { MigrationInterface, QueryRunner } from 'typeorm';

export class AppSecrets1783433000000 implements MigrationInterface {
  name = 'AppSecrets1783433000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_secret" (
        "name" text PRIMARY KEY NOT NULL,
        "value" text NOT NULL,
        "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "app_secret"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class KenBurnsChance1783444000000 implements MigrationInterface {
  name = 'KenBurnsChance1783444000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "kenBurnsChance" integer NOT NULL DEFAULT (40)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "kenBurnsChance"`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class PhotoLensAperture1783436000000 implements MigrationInterface {
  name = 'PhotoLensAperture1783436000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "photo" ADD COLUMN "lens" text`);
    await queryRunner.query(`ALTER TABLE "photo" ADD COLUMN "aperture" real`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "photo" DROP COLUMN "aperture"`);
    await queryRunner.query(`ALTER TABLE "photo" DROP COLUMN "lens"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class PhotoLensApertureScanned1783437000000
  implements MigrationInterface
{
  name = 'PhotoLensApertureScanned1783437000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "photo" ADD COLUMN "lensApertureScanned" boolean NOT NULL DEFAULT (0)`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo" ADD COLUMN "lensApertureCheckedAt" datetime`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_photo_lens_aperture_scanned" ON "photo" ("lensApertureScanned")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_photo_lens_aperture_scanned"`);
    await queryRunner.query(
      `ALTER TABLE "photo" DROP COLUMN "lensApertureCheckedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "photo" DROP COLUMN "lensApertureScanned"`,
    );
  }
}

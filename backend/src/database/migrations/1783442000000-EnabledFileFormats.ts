import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnabledFileFormats1783442000000 implements MigrationInterface {
  name = 'EnabledFileFormats1783442000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "enabledImageFormats" text NOT NULL DEFAULT ('.jpg,.jpeg,.png,.heic,.heif')`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" ADD COLUMN "enabledVideoFormats" text NOT NULL DEFAULT ('.mp4,.mov,.m4v,.webm,.mkv,.avi')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "enabledImageFormats"`,
    );
    await queryRunner.query(
      `ALTER TABLE "settings" DROP COLUMN "enabledVideoFormats"`,
    );
  }
}

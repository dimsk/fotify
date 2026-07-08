import { MigrationInterface, QueryRunner } from "typeorm";

export class CalendarEventLocation1783421634135 implements MigrationInterface {
    name = 'CalendarEventLocation1783421634135'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_c4fb46617064f2f03d68bcfa8d"`);
        await queryRunner.query(`DROP INDEX "IDX_dd89b70fb07059b8b287b6250a"`);
        await queryRunner.query(`DROP INDEX "IDX_80ab7835e1749581a27462eb87"`);
        await queryRunner.query(`CREATE TABLE "temporary_calendar_event" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "calendarId" integer NOT NULL, "externalId" text NOT NULL, "title" text NOT NULL, "startAt" datetime NOT NULL, "endAt" datetime NOT NULL, "isAllDay" boolean NOT NULL, "importantColor" text, "rawColorId" text, "lastSeenAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), "location" text, CONSTRAINT "FK_80ab7835e1749581a27462eb87f" FOREIGN KEY ("calendarId") REFERENCES "calendar" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_calendar_event"("id", "calendarId", "externalId", "title", "startAt", "endAt", "isAllDay", "importantColor", "rawColorId", "lastSeenAt", "createdAt") SELECT "id", "calendarId", "externalId", "title", "startAt", "endAt", "isAllDay", "importantColor", "rawColorId", "lastSeenAt", "createdAt" FROM "calendar_event"`);
        await queryRunner.query(`DROP TABLE "calendar_event"`);
        await queryRunner.query(`ALTER TABLE "temporary_calendar_event" RENAME TO "calendar_event"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c4fb46617064f2f03d68bcfa8d" ON "calendar_event" ("calendarId", "externalId") `);
        await queryRunner.query(`CREATE INDEX "IDX_dd89b70fb07059b8b287b6250a" ON "calendar_event" ("startAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_80ab7835e1749581a27462eb87" ON "calendar_event" ("calendarId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_80ab7835e1749581a27462eb87"`);
        await queryRunner.query(`DROP INDEX "IDX_dd89b70fb07059b8b287b6250a"`);
        await queryRunner.query(`DROP INDEX "IDX_c4fb46617064f2f03d68bcfa8d"`);
        await queryRunner.query(`ALTER TABLE "calendar_event" RENAME TO "temporary_calendar_event"`);
        await queryRunner.query(`CREATE TABLE "calendar_event" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "calendarId" integer NOT NULL, "externalId" text NOT NULL, "title" text NOT NULL, "startAt" datetime NOT NULL, "endAt" datetime NOT NULL, "isAllDay" boolean NOT NULL, "importantColor" text, "rawColorId" text, "lastSeenAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_80ab7835e1749581a27462eb87f" FOREIGN KEY ("calendarId") REFERENCES "calendar" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "calendar_event"("id", "calendarId", "externalId", "title", "startAt", "endAt", "isAllDay", "importantColor", "rawColorId", "lastSeenAt", "createdAt") SELECT "id", "calendarId", "externalId", "title", "startAt", "endAt", "isAllDay", "importantColor", "rawColorId", "lastSeenAt", "createdAt" FROM "temporary_calendar_event"`);
        await queryRunner.query(`DROP TABLE "temporary_calendar_event"`);
        await queryRunner.query(`CREATE INDEX "IDX_80ab7835e1749581a27462eb87" ON "calendar_event" ("calendarId") `);
        await queryRunner.query(`CREATE INDEX "IDX_dd89b70fb07059b8b287b6250a" ON "calendar_event" ("startAt") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c4fb46617064f2f03d68bcfa8d" ON "calendar_event" ("calendarId", "externalId") `);
    }

}

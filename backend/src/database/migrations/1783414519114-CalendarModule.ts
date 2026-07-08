import { MigrationInterface, QueryRunner } from "typeorm";

export class CalendarModule1783414519114 implements MigrationInterface {
    name = 'CalendarModule1783414519114'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "calendar_event" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "calendarId" integer NOT NULL, "externalId" text NOT NULL, "title" text NOT NULL, "startAt" datetime NOT NULL, "endAt" datetime NOT NULL, "isAllDay" boolean NOT NULL, "importantColor" text, "rawColorId" text, "lastSeenAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_80ab7835e1749581a27462eb87" ON "calendar_event" ("calendarId") `);
        await queryRunner.query(`CREATE INDEX "IDX_dd89b70fb07059b8b287b6250a" ON "calendar_event" ("startAt") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c4fb46617064f2f03d68bcfa8d" ON "calendar_event" ("calendarId", "externalId") `);
        await queryRunner.query(`CREATE TABLE "calendar" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "accountId" integer NOT NULL, "externalId" text NOT NULL, "name" text NOT NULL, "providerColor" text, "color" text NOT NULL, "enabled" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE INDEX "IDX_d821a3f2fd8a47b1aa190a05d7" ON "calendar" ("accountId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8632dabd53fa689c6cbcb95494" ON "calendar" ("accountId", "externalId") `);
        await queryRunner.query(`CREATE TABLE "calendar_account" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "provider" text NOT NULL, "label" text NOT NULL, "status" text NOT NULL DEFAULT ('idle'), "lastSyncError" text, "lastSyncedAt" datetime, "googleEmail" text, "googleAccessTokenEnc" text, "googleRefreshTokenEnc" text, "googleAccessTokenExpiresAt" datetime, "appleId" text, "applePasswordEnc" text, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`CREATE TABLE "temporary_settings" ("id" integer PRIMARY KEY NOT NULL DEFAULT (1), "transitionEffects" text NOT NULL DEFAULT ('fade'), "transitionDurationMs" integer NOT NULL DEFAULT (1200), "imageDurationMs" integer NOT NULL DEFAULT (6000), "avoidRepeats" boolean NOT NULL DEFAULT (0), "shuffleMode" text NOT NULL DEFAULT ('all'), "rotationSourceId" integer, "rotationStartedAt" datetime, "cinematicChance" integer NOT NULL DEFAULT (0), "adjacentPortraitTriples" boolean NOT NULL DEFAULT (1), "photoFrameStyle" text NOT NULL DEFAULT ('none'), "nightModeEnabled" boolean NOT NULL DEFAULT (0), "nightModeStart" text NOT NULL DEFAULT ('22:00'), "nightModeEnd" text NOT NULL DEFAULT ('07:00'), "autoRescanEnabled" boolean NOT NULL DEFAULT (0), "collageEnabled" boolean NOT NULL DEFAULT (0), "collageChance" integer NOT NULL DEFAULT (20), "collageTimeWindowMinutes" integer NOT NULL DEFAULT (180), "collageLayouts" text NOT NULL DEFAULT ('random'), "grainEffect" text NOT NULL DEFAULT ('none'), "calendarOverlayEnabled" boolean NOT NULL DEFAULT (0), "calendarOverlayStart" text NOT NULL DEFAULT ('07:00'), "calendarOverlayEnd" text NOT NULL DEFAULT ('22:00'))`);
        await queryRunner.query(`INSERT INTO "temporary_settings"("id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle", "nightModeEnabled", "nightModeStart", "nightModeEnd", "autoRescanEnabled", "collageEnabled", "collageChance", "collageTimeWindowMinutes", "collageLayouts", "grainEffect") SELECT "id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle", "nightModeEnabled", "nightModeStart", "nightModeEnd", "autoRescanEnabled", "collageEnabled", "collageChance", "collageTimeWindowMinutes", "collageLayouts", "grainEffect" FROM "settings"`);
        await queryRunner.query(`DROP TABLE "settings"`);
        await queryRunner.query(`ALTER TABLE "temporary_settings" RENAME TO "settings"`);
        await queryRunner.query(`DROP INDEX "IDX_80ab7835e1749581a27462eb87"`);
        await queryRunner.query(`DROP INDEX "IDX_dd89b70fb07059b8b287b6250a"`);
        await queryRunner.query(`DROP INDEX "IDX_c4fb46617064f2f03d68bcfa8d"`);
        await queryRunner.query(`CREATE TABLE "temporary_calendar_event" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "calendarId" integer NOT NULL, "externalId" text NOT NULL, "title" text NOT NULL, "startAt" datetime NOT NULL, "endAt" datetime NOT NULL, "isAllDay" boolean NOT NULL, "importantColor" text, "rawColorId" text, "lastSeenAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_80ab7835e1749581a27462eb87f" FOREIGN KEY ("calendarId") REFERENCES "calendar" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_calendar_event"("id", "calendarId", "externalId", "title", "startAt", "endAt", "isAllDay", "importantColor", "rawColorId", "lastSeenAt", "createdAt") SELECT "id", "calendarId", "externalId", "title", "startAt", "endAt", "isAllDay", "importantColor", "rawColorId", "lastSeenAt", "createdAt" FROM "calendar_event"`);
        await queryRunner.query(`DROP TABLE "calendar_event"`);
        await queryRunner.query(`ALTER TABLE "temporary_calendar_event" RENAME TO "calendar_event"`);
        await queryRunner.query(`CREATE INDEX "IDX_80ab7835e1749581a27462eb87" ON "calendar_event" ("calendarId") `);
        await queryRunner.query(`CREATE INDEX "IDX_dd89b70fb07059b8b287b6250a" ON "calendar_event" ("startAt") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c4fb46617064f2f03d68bcfa8d" ON "calendar_event" ("calendarId", "externalId") `);
        await queryRunner.query(`DROP INDEX "IDX_d821a3f2fd8a47b1aa190a05d7"`);
        await queryRunner.query(`DROP INDEX "IDX_8632dabd53fa689c6cbcb95494"`);
        await queryRunner.query(`CREATE TABLE "temporary_calendar" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "accountId" integer NOT NULL, "externalId" text NOT NULL, "name" text NOT NULL, "providerColor" text, "color" text NOT NULL, "enabled" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "FK_d821a3f2fd8a47b1aa190a05d72" FOREIGN KEY ("accountId") REFERENCES "calendar_account" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`);
        await queryRunner.query(`INSERT INTO "temporary_calendar"("id", "accountId", "externalId", "name", "providerColor", "color", "enabled", "createdAt") SELECT "id", "accountId", "externalId", "name", "providerColor", "color", "enabled", "createdAt" FROM "calendar"`);
        await queryRunner.query(`DROP TABLE "calendar"`);
        await queryRunner.query(`ALTER TABLE "temporary_calendar" RENAME TO "calendar"`);
        await queryRunner.query(`CREATE INDEX "IDX_d821a3f2fd8a47b1aa190a05d7" ON "calendar" ("accountId") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8632dabd53fa689c6cbcb95494" ON "calendar" ("accountId", "externalId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "IDX_8632dabd53fa689c6cbcb95494"`);
        await queryRunner.query(`DROP INDEX "IDX_d821a3f2fd8a47b1aa190a05d7"`);
        await queryRunner.query(`ALTER TABLE "calendar" RENAME TO "temporary_calendar"`);
        await queryRunner.query(`CREATE TABLE "calendar" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "accountId" integer NOT NULL, "externalId" text NOT NULL, "name" text NOT NULL, "providerColor" text, "color" text NOT NULL, "enabled" boolean NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "calendar"("id", "accountId", "externalId", "name", "providerColor", "color", "enabled", "createdAt") SELECT "id", "accountId", "externalId", "name", "providerColor", "color", "enabled", "createdAt" FROM "temporary_calendar"`);
        await queryRunner.query(`DROP TABLE "temporary_calendar"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_8632dabd53fa689c6cbcb95494" ON "calendar" ("accountId", "externalId") `);
        await queryRunner.query(`CREATE INDEX "IDX_d821a3f2fd8a47b1aa190a05d7" ON "calendar" ("accountId") `);
        await queryRunner.query(`DROP INDEX "IDX_c4fb46617064f2f03d68bcfa8d"`);
        await queryRunner.query(`DROP INDEX "IDX_dd89b70fb07059b8b287b6250a"`);
        await queryRunner.query(`DROP INDEX "IDX_80ab7835e1749581a27462eb87"`);
        await queryRunner.query(`ALTER TABLE "calendar_event" RENAME TO "temporary_calendar_event"`);
        await queryRunner.query(`CREATE TABLE "calendar_event" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "calendarId" integer NOT NULL, "externalId" text NOT NULL, "title" text NOT NULL, "startAt" datetime NOT NULL, "endAt" datetime NOT NULL, "isAllDay" boolean NOT NULL, "importantColor" text, "rawColorId" text, "lastSeenAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')))`);
        await queryRunner.query(`INSERT INTO "calendar_event"("id", "calendarId", "externalId", "title", "startAt", "endAt", "isAllDay", "importantColor", "rawColorId", "lastSeenAt", "createdAt") SELECT "id", "calendarId", "externalId", "title", "startAt", "endAt", "isAllDay", "importantColor", "rawColorId", "lastSeenAt", "createdAt" FROM "temporary_calendar_event"`);
        await queryRunner.query(`DROP TABLE "temporary_calendar_event"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_c4fb46617064f2f03d68bcfa8d" ON "calendar_event" ("calendarId", "externalId") `);
        await queryRunner.query(`CREATE INDEX "IDX_dd89b70fb07059b8b287b6250a" ON "calendar_event" ("startAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_80ab7835e1749581a27462eb87" ON "calendar_event" ("calendarId") `);
        await queryRunner.query(`ALTER TABLE "settings" RENAME TO "temporary_settings"`);
        await queryRunner.query(`CREATE TABLE "settings" ("id" integer PRIMARY KEY NOT NULL DEFAULT (1), "transitionEffects" text NOT NULL DEFAULT ('fade'), "transitionDurationMs" integer NOT NULL DEFAULT (1200), "imageDurationMs" integer NOT NULL DEFAULT (6000), "avoidRepeats" boolean NOT NULL DEFAULT (0), "shuffleMode" text NOT NULL DEFAULT ('all'), "rotationSourceId" integer, "rotationStartedAt" datetime, "cinematicChance" integer NOT NULL DEFAULT (0), "adjacentPortraitTriples" boolean NOT NULL DEFAULT (1), "photoFrameStyle" text NOT NULL DEFAULT ('none'), "nightModeEnabled" boolean NOT NULL DEFAULT (0), "nightModeStart" text NOT NULL DEFAULT ('22:00'), "nightModeEnd" text NOT NULL DEFAULT ('07:00'), "autoRescanEnabled" boolean NOT NULL DEFAULT (0), "collageEnabled" boolean NOT NULL DEFAULT (0), "collageChance" integer NOT NULL DEFAULT (20), "collageTimeWindowMinutes" integer NOT NULL DEFAULT (180), "collageLayouts" text NOT NULL DEFAULT ('random'), "grainEffect" text NOT NULL DEFAULT ('none'))`);
        await queryRunner.query(`INSERT INTO "settings"("id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle", "nightModeEnabled", "nightModeStart", "nightModeEnd", "autoRescanEnabled", "collageEnabled", "collageChance", "collageTimeWindowMinutes", "collageLayouts", "grainEffect") SELECT "id", "transitionEffects", "transitionDurationMs", "imageDurationMs", "avoidRepeats", "shuffleMode", "rotationSourceId", "rotationStartedAt", "cinematicChance", "adjacentPortraitTriples", "photoFrameStyle", "nightModeEnabled", "nightModeStart", "nightModeEnd", "autoRescanEnabled", "collageEnabled", "collageChance", "collageTimeWindowMinutes", "collageLayouts", "grainEffect" FROM "temporary_settings"`);
        await queryRunner.query(`DROP TABLE "temporary_settings"`);
        await queryRunner.query(`DROP TABLE "calendar_account"`);
        await queryRunner.query(`DROP INDEX "IDX_8632dabd53fa689c6cbcb95494"`);
        await queryRunner.query(`DROP INDEX "IDX_d821a3f2fd8a47b1aa190a05d7"`);
        await queryRunner.query(`DROP TABLE "calendar"`);
        await queryRunner.query(`DROP INDEX "IDX_c4fb46617064f2f03d68bcfa8d"`);
        await queryRunner.query(`DROP INDEX "IDX_dd89b70fb07059b8b287b6250a"`);
        await queryRunner.query(`DROP INDEX "IDX_80ab7835e1749581a27462eb87"`);
        await queryRunner.query(`DROP TABLE "calendar_event"`);
    }

}

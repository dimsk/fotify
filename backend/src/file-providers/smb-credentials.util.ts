import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { getDataDir } from '../common/data-dir.util';

const APP_SECRET_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS "app_secret" (
    "name" text PRIMARY KEY NOT NULL,
    "value" text NOT NULL,
    "createdAt" datetime NOT NULL DEFAULT (datetime('now'))
  )
`;
const ENCRYPTION_SECRET_NAME = 'encryption-key';

let cachedKey: Buffer | null = null;
let cachedSecret: string | null = null;

function deriveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const secret = loadOrCreatePersistedSecret();
  cachedKey = createHash('sha256').update(secret).digest();
  return cachedKey;
}

function loadOrCreatePersistedSecret(): string {
  if (cachedSecret) return cachedSecret;

  const db = openSecretsDb();
  try {
    db.exec(APP_SECRET_TABLE_SQL);
    const existing = db
      .prepare(`SELECT value FROM "app_secret" WHERE name = ?`)
      .get(ENCRYPTION_SECRET_NAME) as { value: string } | undefined;
    if (existing?.value?.trim()) {
      cachedSecret = existing.value.trim();
      return cachedSecret;
    }

    const secret = loadLegacyFileSecret() ?? randomBytes(32).toString('hex');
    db.prepare(
      `INSERT INTO "app_secret" (name, value) VALUES (?, ?)
       ON CONFLICT(name) DO UPDATE SET value = excluded.value`,
    ).run(ENCRYPTION_SECRET_NAME, secret);
    cachedSecret = secret;
    return secret;
  } finally {
    db.close();
  }
}

function openSecretsDb(): Database.Database {
  const dataDir = getDataDir();
  mkdirSync(dataDir, { recursive: true });
  const dbPath = join(dataDir, 'fotify.db');
  return new Database(dbPath);
}

function loadLegacyFileSecret(): string | null {
  const dataDir = getDataDir();
  const keyPath = join(dataDir, 'encryption.key');
  if (existsSync(keyPath)) {
    const secret = readFileSync(keyPath, 'utf8').trim();
    return secret || null;
  }
  return null;
}

export function encryptSecret(plainText: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptSecret(encoded: string): string {
  const key = deriveKey();
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

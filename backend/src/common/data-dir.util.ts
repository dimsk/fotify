import { join } from 'path';

/** Where the app's persistent state (SQLite DB, cache, generated keys) lives. */
export function getDataDir(): string {
  return process.env.FOTIFY_DATA_DIR ?? join(__dirname, '..', '..', 'data');
}

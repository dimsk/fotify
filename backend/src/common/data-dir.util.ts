import { join } from 'path';

/** Where the app's persistent state (SQLite DB, cache, imported legacy key file) lives. */
export function getDataDir(): string {
  return process.env.FOTIFY_DATA_DIR ?? join(__dirname, '..', '..', 'data');
}

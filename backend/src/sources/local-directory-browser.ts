import { promises as fs } from 'fs';
import { dirname } from 'path';
import { isHiddenDirectoryName } from '../common/hidden-directories';

export interface DirectoryListing {
  currentPath: string;
  parentPath: string | null;
  directories: Array<{ name: string; path: string }>;
}

export async function listLocalDirectory(absolutePath: string): Promise<DirectoryListing> {
  const entries = await fs.readdir(absolutePath, { withFileTypes: true });
  const directories = entries
    .filter((entry) => entry.isDirectory() && !isHiddenDirectoryName(entry.name))
    .map((entry) => ({
      name: entry.name,
      path: absolutePath === '/' ? `/${entry.name}` : `${absolutePath}/${entry.name}`,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const parent = dirname(absolutePath);
  return {
    currentPath: absolutePath,
    parentPath: parent === absolutePath ? null : parent,
    directories,
  };
}

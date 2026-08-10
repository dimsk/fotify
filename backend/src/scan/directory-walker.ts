import { extname } from 'path';
import { FileProvider } from '../file-providers/file-provider.interface';
import { isHiddenDirectoryName } from '../common/hidden-directories';

export interface WalkedFile {
  relativePath: string;
  size: number | null;
  modifiedAt: Date | null;
}

export async function walkMediaFiles(
  provider: FileProvider,
  mediaExtensions: Set<string>,
  dir = '',
): Promise<WalkedFile[]> {
  const entries = await provider.listDir(dir);
  const files: WalkedFile[] = [];

  for (const entry of entries) {
    if (isHiddenDirectoryName(entry.name)) {
      continue;
    }
    const childPath = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      files.push(...(await walkMediaFiles(provider, mediaExtensions, childPath)));
    } else if (mediaExtensions.has(extname(entry.name).toLowerCase())) {
      files.push({
        relativePath: childPath,
        size: entry.size,
        modifiedAt: entry.modifiedAt,
      });
    }
  }

  return files;
}

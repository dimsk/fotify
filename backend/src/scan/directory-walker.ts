import { extname } from 'path';
import { FileProvider } from '../file-providers/file-provider.interface';
import { isHiddenDirectoryName } from '../common/hidden-directories';

export async function walkImageFiles(
  provider: FileProvider,
  imageExtensions: Set<string>,
  dir = '',
): Promise<string[]> {
  const entries = await provider.listDir(dir);
  const files: string[] = [];

  for (const entry of entries) {
    if (isHiddenDirectoryName(entry.name)) {
      continue;
    }
    const childPath = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      files.push(...(await walkImageFiles(provider, imageExtensions, childPath)));
    } else if (imageExtensions.has(extname(entry.name).toLowerCase())) {
      files.push(childPath);
    }
  }

  return files;
}

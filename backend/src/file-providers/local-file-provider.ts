import { createReadStream, promises as fs } from 'fs';
import { join, resolve, sep } from 'path';
import { FileEntry, FileProvider } from './file-provider.interface';

export class LocalFileProvider implements FileProvider {
  private readonly root: string;

  constructor(rootPath: string) {
    this.root = resolve(rootPath);
  }

  async connect(): Promise<void> {
    // no-op: nothing to open for local filesystem access
  }

  async disconnect(): Promise<void> {
    // no-op
  }

  async listDir(relativePath: string): Promise<FileEntry[]> {
    const dirPath = this.resolveSafe(relativePath);
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return Promise.all(
      entries.map(async (entry) => {
        const stat = entry.isDirectory()
          ? null
          : await fs.stat(this.resolveSafe(join(relativePath, entry.name)));
        return {
          name: entry.name,
          isDirectory: entry.isDirectory(),
          size: stat?.size ?? null,
          modifiedAt: stat?.mtime ?? null,
        };
      }),
    );
  }

  async readFile(relativePath: string): Promise<Buffer> {
    const filePath = this.resolveSafe(relativePath);
    return fs.readFile(filePath);
  }

  async createReadStream(relativePath: string) {
    return createReadStream(this.resolveSafe(relativePath));
  }

  private resolveSafe(relativePath: string): string {
    const target = resolve(join(this.root, relativePath));
    if (target !== this.root && !target.startsWith(this.root + sep)) {
      throw new Error(`Path traversal rejected: ${relativePath}`);
    }
    return target;
  }
}

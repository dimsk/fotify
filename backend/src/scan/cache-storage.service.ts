import { Injectable } from '@nestjs/common';
import { promises as fs } from 'fs';
import { dirname, join } from 'path';

const DEFAULT_DATA_DIR = join(__dirname, '..', '..', 'data');

@Injectable()
export class CacheStorageService {
  private readonly cacheDir = join(process.env.FOTIFY_DATA_DIR ?? DEFAULT_DATA_DIR, 'cache');

  /** Shards cache files by hash prefix so no single directory grows unbounded. */
  async pathForHash(
    fileHash: string,
    extension = '.jpg',
    variant?: string,
  ): Promise<string> {
    const shard = fileHash.slice(0, 2);
    const shardDir = join(this.cacheDir, shard);
    await fs.mkdir(shardDir, { recursive: true });
    const suffix = variant ? `-${variant.replace(/[^a-z0-9-]/gi, '')}` : '';
    const normalizedExtension = extension.startsWith('.')
      ? extension
      : `.${extension}`;
    return join(shardDir, `${fileHash}${suffix}${normalizedExtension}`);
  }

  /** Deletes a cache file and, if that leaves its shard directory empty, removes the directory too. */
  async delete(cachedDisplayPath: string | null): Promise<void> {
    if (!cachedDisplayPath) return;
    try {
      await fs.unlink(cachedDisplayPath);
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.error(`Failed to delete cache file ${cachedDisplayPath}:`, err);
        return;
      }
    }
    await this.removeShardDirIfEmpty(dirname(cachedDisplayPath));
  }

  /** Walks the whole cache directory to report how much disk it currently occupies. */
  async getDirStats(): Promise<{ fileCount: number; totalBytes: number }> {
    let fileCount = 0;
    let totalBytes = 0;

    const shardEntries = await fs.readdir(this.cacheDir, { withFileTypes: true }).catch(() => []);
    for (const shard of shardEntries) {
      if (!shard.isDirectory()) continue;
      const shardPath = join(this.cacheDir, shard.name);
      const files = await fs.readdir(shardPath).catch(() => []);
      for (const file of files) {
        const stat = await fs.stat(join(shardPath, file)).catch(() => null);
        if (stat) {
          fileCount += 1;
          totalBytes += stat.size;
        }
      }
    }

    return { fileCount, totalBytes };
  }

  private async removeShardDirIfEmpty(shardDir: string): Promise<void> {
    try {
      const entries = await fs.readdir(shardDir);
      if (entries.length === 0) {
        await fs.rmdir(shardDir);
      }
    } catch (err: any) {
      if (err?.code !== 'ENOENT') {
        console.error(`Failed to remove empty cache shard dir ${shardDir}:`, err);
      }
    }
  }
}

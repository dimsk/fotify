import type { Readable } from 'stream';

export interface FileEntry {
  name: string;
  isDirectory: boolean;
  size: number | null;
  modifiedAt: Date | null;
}

export interface FileProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listDir(relativePath: string): Promise<FileEntry[]>;
  readFile(relativePath: string): Promise<Buffer>;
  createReadStream(
    relativePath: string,
    options?: { start?: number; end?: number },
  ): Promise<Readable>;
  /** Byte size of a single file — used to answer HTTP range requests when direct-streaming videos. */
  getFileSize(relativePath: string): Promise<number>;
}

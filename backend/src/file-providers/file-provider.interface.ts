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
  createReadStream(relativePath: string): Promise<Readable>;
}

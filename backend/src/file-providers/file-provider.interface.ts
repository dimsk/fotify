export interface FileEntry {
  name: string;
  isDirectory: boolean;
}

export interface FileProvider {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  listDir(relativePath: string): Promise<FileEntry[]>;
  readFile(relativePath: string): Promise<Buffer>;
}

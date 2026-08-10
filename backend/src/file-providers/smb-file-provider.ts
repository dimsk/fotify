import { Client } from 'node-smb2';
import { FileEntry, FileProvider } from './file-provider.interface';

export interface SmbConnectionOptions {
  host: string;
  share: string;
  username: string;
  password: string;
  domain?: string;
  rootPath?: string;
  port?: number;
}

function joinSmbPath(...segments: string[]): string {
  return segments
    .map((segment) => segment.replace(/^\/+|\/+$/g, ''))
    .filter((segment) => segment.length > 0)
    .join('/');
}

function normalizeEntryName(rawName: string): string {
  return rawName.replace(/^\.\/+/, '');
}

export class SmbFileProvider implements FileProvider {
  private client: Client | null = null;
  private session: Awaited<ReturnType<Client['authenticate']>> | null = null;
  private tree: Awaited<ReturnType<NonNullable<SmbFileProvider['session']>['connectTree']>> | null =
    null;

  constructor(private readonly options: SmbConnectionOptions) {}

  async connect(): Promise<void> {
    this.client = new Client(this.options.host, { port: this.options.port ?? 445 });
    await this.client.connect();
    this.session = await this.client.authenticate({
      domain: this.options.domain ?? '',
      username: this.options.username,
      password: this.options.password,
      forceNtlmVersion: 'v2',
    });
    this.tree = await this.session.connectTree(this.options.share);
  }

  async disconnect(): Promise<void> {
    try {
      await this.tree?.disconnect();
      await this.session?.logoff();
      await this.client?.close();
    } finally {
      this.tree = null;
      this.session = null;
      this.client = null;
    }
  }

  async listDir(relativePath: string): Promise<FileEntry[]> {
    const path = joinSmbPath(this.options.rootPath ?? '', relativePath);
    const entries = await this.requireTree().readDirectory(path);
    return entries
      .map((entry) => ({
        name: normalizeEntryName(entry.filename),
        isDirectory: entry.type === 'Directory',
        size: entry.type === 'Directory' ? null : Number(entry.fileSize),
        modifiedAt: entry.type === 'Directory' ? null : entry.lastWriteTime,
      }))
      .filter((entry) => entry.name !== '.' && entry.name !== '..' && entry.name.length > 0);
  }

  async readFile(relativePath: string): Promise<Buffer> {
    const path = joinSmbPath(this.options.rootPath ?? '', relativePath);
    return this.requireTree().readFile(path);
  }

  async createReadStream(relativePath: string) {
    const path = joinSmbPath(this.options.rootPath ?? '', relativePath);
    return this.requireTree().createFileReadStream(path);
  }

  private requireTree() {
    if (!this.tree) {
      throw new Error('SmbFileProvider not connected — call connect() first');
    }
    return this.tree;
  }
}

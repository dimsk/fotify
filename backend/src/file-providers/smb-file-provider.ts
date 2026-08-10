import { Client } from 'node-smb2';
// Internal class, not re-exported by the package index — needed for
// positioned reads (see createReadStream below).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SmbFile = require('node-smb2/dist/client/File').default;
import { Readable } from 'stream';
import { FileEntry, FileProvider } from './file-provider.interface';

/** Must match node-smb2's internal maxReadChunkLength (File.js). */
const SMB_READ_CHUNK_LENGTH = 0x00010000;

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

  async createReadStream(
    relativePath: string,
    options?: { start?: number; end?: number },
  ) {
    const path = joinSmbPath(this.options.rootPath ?? '', relativePath);
    if (!options || (options.start === undefined && options.end === undefined)) {
      return this.requireTree().createFileReadStream(path);
    }
    // node-smb2's own stream always reads from byte 0; for ranged requests
    // (browser video seeks) open the file ourselves and issue positioned
    // reads via the internal readChunk(offset) API, so a seek to minute 4
    // of a clip doesn't have to transfer and discard the first 4 minutes.
    const tree = this.requireTree() as any;
    const file = new SmbFile(tree);
    tree.registerFile(file);
    await file.open(path);
    const fileSize = Number(file.fileSize);
    const start = Math.min(options.start ?? 0, fileSize);
    const endExclusive = Math.min((options.end ?? fileSize - 1) + 1, fileSize);
    const stream = Readable.from(
      (async function* () {
        let offset = start;
        let index = Math.floor(offset / SMB_READ_CHUNK_LENGTH);
        while (offset < endExclusive) {
          const chunk: Buffer = await file.readChunk(index, offset);
          yield chunk.subarray(0, Math.min(chunk.length, endExclusive - offset));
          offset += chunk.length;
          index += 1;
        }
      })(),
    );
    stream.once('close', async () => {
      await file.close();
    });
    return stream;
  }

  async getFileSize(relativePath: string): Promise<number> {
    // node-smb2 exposes no standalone stat; resolve the containing directory
    // and match the entry — one extra roundtrip, but only once per direct
    // video stream (range requests afterwards reuse the browser's cache).
    const normalized = relativePath.replace(/^\/+|\/+$/g, '');
    const lastSlash = normalized.lastIndexOf('/');
    const dir = lastSlash >= 0 ? normalized.slice(0, lastSlash) : '';
    const name = lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
    const entries = await this.listDir(dir);
    const entry = entries.find(
      (candidate) => !candidate.isDirectory && candidate.name === name,
    );
    if (!entry || entry.size === null) {
      throw new Error(`Could not determine size of ${relativePath}`);
    }
    return entry.size;
  }

  private requireTree() {
    if (!this.tree) {
      throw new Error('SmbFileProvider not connected — call connect() first');
    }
    return this.tree;
  }
}

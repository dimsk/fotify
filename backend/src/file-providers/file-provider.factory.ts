import { Injectable } from '@nestjs/common';
import { Source } from '../sources/source.entity';
import { FileProvider } from './file-provider.interface';
import { LocalFileProvider } from './local-file-provider';
import { SmbFileProvider, SmbConnectionOptions } from './smb-file-provider';
import { decryptSecret } from './smb-credentials.util';

@Injectable()
export class FileProviderFactory {
  forSource(source: Source): FileProvider {
    if (source.type === 'local') {
      if (!source.localPath) {
        throw new Error(`Source ${source.id} is type=local but has no localPath`);
      }
      return new LocalFileProvider(source.localPath);
    }
    return new SmbFileProvider(this.smbOptionsFromSource(source));
  }

  forSmbConfig(options: SmbConnectionOptions): FileProvider {
    return new SmbFileProvider(options);
  }

  private smbOptionsFromSource(source: Source): SmbConnectionOptions {
    if (!source.smbHost || !source.smbShare || !source.smbUsername || !source.smbPasswordEnc) {
      throw new Error(`Source ${source.id} is type=smb but is missing connection details`);
    }
    return {
      host: source.smbHost,
      share: source.smbShare,
      username: source.smbUsername,
      password: decryptSecret(source.smbPasswordEnc),
      domain: source.smbDomain ?? '',
      rootPath: source.smbRootPath ?? '',
    };
  }

  /** Runs `fn` with a connected FileProvider, guaranteeing disconnect afterwards. */
  async withProvider<T>(provider: FileProvider, fn: (provider: FileProvider) => Promise<T>): Promise<T> {
    await provider.connect();
    try {
      return await fn(provider);
    } finally {
      await provider.disconnect();
    }
  }
}

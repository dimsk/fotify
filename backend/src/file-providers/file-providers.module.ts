import { Module } from '@nestjs/common';
import { FileProviderFactory } from './file-provider.factory';

@Module({
  providers: [FileProviderFactory],
  exports: [FileProviderFactory],
})
export class FileProvidersModule {}

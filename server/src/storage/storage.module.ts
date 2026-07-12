import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE } from './storage.interface';
import { LocalStorageAdapter } from './local-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';

/**
 * STORAGE MODULE  (@Global — the disk manager)
 * --------------------------------------------
 * A factory provider binds the STORAGE token to ONE concrete adapter, chosen by
 * STORAGE_DRIVER (local | s3). @Global means any module can `@Inject(STORAGE)`
 * without importing this module. (Laravel: the FilesystemManager resolving the
 * disk named by FILESYSTEM_DISK; call sites just ask for `Storage`.)
 *
 * Both adapters are also declared as providers so Nest can construct whichever one
 * the factory returns (they each need ConfigService injected).
 */
@Global()
@Module({
  providers: [
    LocalStorageAdapter,
    S3StorageAdapter,
    {
      provide: STORAGE,
      inject: [ConfigService, LocalStorageAdapter, S3StorageAdapter],
      useFactory: (
        config: ConfigService,
        local: LocalStorageAdapter,
        s3: S3StorageAdapter,
      ) => (config.get<string>('STORAGE_DRIVER') === 's3' ? s3 : local),
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}

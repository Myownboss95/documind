import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { StorageAdapter } from './storage.interface';

/**
 * LOCAL STORAGE ADAPTER  (the offline default)
 * --------------------------------------------
 * Writes uploaded bytes to a directory on disk (STORAGE_LOCAL_DIR, default
 * ./uploads) and returns a `local://<key>` URI. No creds, no network — this is the
 * offline-first analogue of Laravel's `local` disk (storage/app).
 *
 * The key is namespaced (may contain '/') so we join it under the base dir and
 * mkdir -p the parent before writing. We resolve + guard against path traversal so
 * a crafted key like ../../etc can't escape the storage root.
 */
@Injectable()
export class LocalStorageAdapter implements StorageAdapter {
  private readonly logger = new Logger('LocalStorageAdapter');
  private readonly baseDir: string;

  constructor(config: ConfigService) {
    // Relative dirs resolve against process cwd (server/ when you run the app).
    this.baseDir = path.resolve(config.get<string>('STORAGE_LOCAL_DIR') ?? './uploads');
  }

  /** Resolve `key` under baseDir and refuse anything that escapes the root. */
  private resolveKey(key: string): string {
    const full = path.resolve(this.baseDir, key);
    if (full !== this.baseDir && !full.startsWith(this.baseDir + path.sep)) {
      throw new Error(`invalid storage key (path traversal): ${key}`);
    }
    return full;
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<string> {
    const full = this.resolveKey(key);
    await fs.mkdir(path.dirname(full), { recursive: true }); // create dir if missing
    await fs.writeFile(full, data);
    this.logger.log(`stored ${data.length}B -> ${full}`);
    return `local://${key}`;
  }

  async get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolveKey(key));
  }

  async delete(key: string): Promise<void> {
    // force:true -> a missing file is not an error (idempotent delete).
    await fs.rm(this.resolveKey(key), { force: true });
  }
}

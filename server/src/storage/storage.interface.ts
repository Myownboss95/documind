/**
 * STORAGE ADAPTER  (File-upload stage · the seam)
 * -----------------------------------------------
 * One tiny interface, two interchangeable implementations (local disk now, S3
 * later). Business code depends ONLY on this interface via the STORAGE token, so
 * swapping the backend is an env flag — no call-site changes.
 *
 * LARAVEL PARALLEL: this is Laravel's Filesystem abstraction. `Storage::disk('local')`
 * vs `Storage::disk('s3')` implement the same contract (`put/get/delete`); config
 * (`config/filesystems.php` + FILESYSTEM_DISK) picks the driver. Here the DI token
 * + factory (storage.module.ts) play the role of the disk manager.
 *
 * WHY a token (not the class): interfaces vanish at runtime (they're erased by TS),
 * so Nest can't inject "a StorageAdapter" by type. We inject by an explicit STRING
 * TOKEN and bind it to whichever concrete class the factory chose.
 */
export interface StorageAdapter {
  /** Persist bytes under `key`; returns a URI/locator (e.g. local://… or s3://…). */
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  /** Read the bytes previously stored under `key`. */
  get(key: string): Promise<Buffer>;
  /** Remove the object at `key` (idempotent — missing key is not an error). */
  delete(key: string): Promise<void>;
}

/** DI token — inject with `@Inject(STORAGE)`. (Laravel: the resolved `Storage::disk`.) */
export const STORAGE = 'STORAGE';

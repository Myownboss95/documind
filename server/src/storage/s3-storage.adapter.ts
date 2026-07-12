import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import type { StorageAdapter } from './storage.interface';

/**
 * S3 STORAGE ADAPTER  (production backend — SAME interface)
 * --------------------------------------------------------
 * Implements the identical StorageAdapter contract against AWS S3 (or any
 * S3-compatible store: MinIO, R2, DigitalOcean Spaces — set S3_ENDPOINT). It's
 * SELECTABLE via STORAGE_DRIVER=s3 but can't be exercised offline without creds;
 * it just has to compile and be swappable. This is the whole point of the seam:
 * the upload controller never changes when you flip local -> s3.
 *
 * LARAVEL PARALLEL: `Storage::disk('s3')` — same `put/get/delete`, different driver.
 *
 * Creds: the SDK's default provider chain reads env (AWS_ACCESS_KEY_ID /
 * AWS_SECRET_ACCESS_KEY / AWS_REGION) and IAM roles automatically; we only pass
 * explicit values when present so on real infra you'd rely on the instance role.
 */
@Injectable()
export class S3StorageAdapter implements StorageAdapter {
  private readonly logger = new Logger('S3StorageAdapter');
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET') ?? '';
    const region = config.get<string>('AWS_REGION') ?? config.get<string>('S3_REGION');
    const accessKeyId = config.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = config.get<string>('AWS_SECRET_ACCESS_KEY');
    const endpoint = config.get<string>('S3_ENDPOINT'); // optional (MinIO/R2)

    this.client = new S3Client({
      region: region || 'us-east-1',
      ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
      // Only set explicit creds if provided; else fall back to the default chain.
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  async put(key: string, data: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
    this.logger.log(`stored ${data.length}B -> s3://${this.bucket}/${key}`);
    return `s3://${this.bucket}/${key}`;
  }

  async get(key: string): Promise<Buffer> {
    const out = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    // Body is an SdkStream; transformToByteArray() drains it to bytes.
    const bytes = await out.Body!.transformToByteArray();
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS } from './redis.constants';

/**
 * CACHE SERVICE  (Stage 4 · cache-aside)
 * --------------------------------------
 * Thin JSON wrapper over Redis. Cache-aside pattern:
 *   read  -> try cache; on MISS, load from DB and populate cache with a TTL
 *   write -> update DB, then INVALIDATE (delete) the cache key
 * (Laravel: Cache::remember($key, $ttl, fn) + Cache::forget($key).)
 */
@Injectable()
export class CacheService {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    // 'EX' sets an expiry -> the cache self-heals; even if we forget to invalidate,
    // stale data lives at most ttlSeconds. TTL is your safety net.
    await this.redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }
}

import type { Redis } from 'ioredis';
import { canonicalQuery, type CatalogQuery } from './catalog-query.js';
import type { CatalogPage } from './catalog.repository.js';

/** Ton kho duoc phep tre toi da 60s -> moi ket qua loc song toi da 60s. */
export const CATALOG_TTL_SEC = 60;
export const DEFAULT_MAX_KEYS = 20_000;

/** Nhom khong loc danh muc - chua san pham cua moi danh muc. */
export const ALL_CATEGORIES = '*';

const REGISTRY_KEY = 'catalog:keys';
const versionKey = (scope: string) => `catalog:ver:${scope}`;

/**
 * Ghi ket qua kem gioi han tong so khoa (nguyen tu trong Lua):
 * registry la ZSET <khoa, thoi diem het han>; don cac khoa da het han roi moi dem.
 * Day thi khong ghi khoa moi (van cho phep ghi de khoa da co).
 */
const SET_WITH_CAP_SCRIPT = `
redis.call('zremrangebyscore', KEYS[2], '-inf', ARGV[3])
if redis.call('zcard', KEYS[2]) >= tonumber(ARGV[4]) and not redis.call('zscore', KEYS[2], KEYS[1]) then
  return 0
end
redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('zadd', KEYS[2], ARGV[5], KEYS[1])
return 1`;

/** Lop truy cap Redis cho trang danh muc. */
export class CatalogCache {
  constructor(
    private readonly redis: Redis,
    private readonly maxKeys = DEFAULT_MAX_KEYS,
  ) {}

  /** Moi nhom (mot danh muc, hoac "*") co mot so phien ban; doi phien ban = vo hieu hoa ca nhom. */
  async version(scope: string): Promise<number> {
    return Number((await this.redis.get(versionKey(scope))) ?? 0);
  }

  keyFor(scope: string, version: number, q: CatalogQuery): string {
    return `catalog:${scope}:v${version}:${canonicalQuery(q)}`;
  }

  async get(key: string): Promise<CatalogPage | null> {
    const raw = await this.redis.get(key);
    return raw ? JSON.parse(raw) : null;
  }

  async set(key: string, page: CatalogPage): Promise<boolean> {
    const now = Date.now();
    const stored = await this.redis.eval(
      SET_WITH_CAP_SCRIPT, 2, key, REGISTRY_KEY,
      JSON.stringify(page), CATALOG_TTL_SEC, now, this.maxKeys, now + CATALOG_TTL_SEC * 1000,
    );
    return stored === 1;
  }

  /** Gia doi -> moi ket qua cua danh muc do va moi ket qua khong loc danh muc tro nen cu ngay lap tuc. */
  async invalidateCategory(category: string): Promise<void> {
    await this.redis.multi().incr(versionKey(category)).incr(versionKey(ALL_CATEGORIES)).exec();
  }

  async keyCount(): Promise<number> {
    await this.redis.zremrangebyscore(REGISTRY_KEY, '-inf', Date.now());
    return this.redis.zcard(REGISTRY_KEY);
  }
}

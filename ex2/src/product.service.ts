import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { ServiceUnavailableException } from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { Product, ProductRepository } from './product.repository.js';

export const CACHE_TTL_SEC = 300;
/** Cong them 0..60s ngau nhien de cac khoa duoc dung cung luc khong het han cung luc. */
export const CACHE_TTL_JITTER_SEC = 60;
/** Khoa tu het han sau 5s: tien trinh giu khoa bi chet thi he thong khong ket vinh vien. */
export const LOCK_TTL_MS = 5_000;
export const WAIT_RETRY_DELAY_MS = 50;
/** Toi da 40 lan x 50ms = 2s cho; het luot thi tra 503, khong lap vo tan. */
export const WAIT_MAX_RETRIES = 40;

/** Chi xoa khoa neu van la khoa cua minh (token khop) - tranh xoa nham khoa cua request khac khi khoa cu da het han. */
const RELEASE_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
end
return 0`;

export const productKey = (id: string) => `shopfast:product:${id}`;
export const lockKeyOf = (key: string) => `${key}:lock`;

export class ProductService {
  constructor(
    private readonly redis: Redis,
    private readonly repo: ProductRepository,
  ) {}

  async getProductWithLock(id: string): Promise<Product> {
    const key = productKey(id);
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);

    // (1) gianh khoa phan tan truoc khi xuong DB
    const lockKey = lockKeyOf(key);
    const token = randomUUID();
    const acquired = await this.tryLock(lockKey, token);

    // (2) khong gianh duoc khoa -> cho roi doc lai cache, co gioi han so lan
    if (!acquired) return this.waitForCache(id, key, lockKey, token);

    return this.rebuild(id, key, lockKey, token);
  }

  private async rebuild(id: string, key: string, lockKey: string, token: string): Promise<Product> {
    try {
      const product = await this.repo.findById(id);

      // (3) do lech ngau nhien cho thoi gian song
      const ttl = CACHE_TTL_SEC + randomInt(0, CACHE_TTL_JITTER_SEC + 1);
      await this.redis.set(key, JSON.stringify(product), 'EX', ttl);

      return product;
    } finally {
      // (4) giai phong khoa phan tan
      // (5) nam trong finally -> van giai phong ca khi truy van DB nem loi
      await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token);
    }
  }

  private async waitForCache(id: string, key: string, lockKey: string, token: string): Promise<Product> {
    for (let attempt = 1; attempt <= WAIT_MAX_RETRIES; attempt++) {
      await sleep(WAIT_RETRY_DELAY_MS);

      const cached = await this.redis.get(key);
      if (cached) return JSON.parse(cached);

      // Nguoi giu khoa that bai (DB loi) hoac chet (khoa tu het han) ma cache van trong
      // -> mot request dang cho se gianh khoa va dung lai, nhung van chi mot request mot luc
      if (await this.tryLock(lockKey, token)) return this.rebuild(id, key, lockKey, token);
    }
    throw new ServiceUnavailableException(`San pham ${id} dang duoc tai, vui long thu lai`);
  }

  private async tryLock(lockKey: string, token: string) {
    return (await this.redis.set(lockKey, token, 'PX', LOCK_TTL_MS, 'NX')) === 'OK';
  }
}

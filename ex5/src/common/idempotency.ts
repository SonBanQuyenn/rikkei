import type { Redis } from 'ioredis';

export class TaskInProgressError extends Error {}

/**
 * Bao dam moi tac vu (theo khoa nghiep vu) chi tao tac dung phu mot lan, du job bi chay lai
 * (thu lai, tien trinh chet giua chung, them job trung):
 *   - 'done'    -> bo qua ngay;
 *   - 'running' -> tien trinh khac dang chay -> nem loi tam thoi, BullMQ thu lai sau;
 *   - chua co   -> giu khoa (het han sau lockTtlMs neu tien trinh chet), chay, ghi 'done' (TTL 7 ngay).
 * Tac vu loi -> nha khoa de lan thu sau chay lai.
 */
export class IdempotencyGuard {
  constructor(
    private readonly redis: Redis,
    private readonly ns = 'idem',
    private readonly doneTtlSec = 7 * 24 * 3600,
  ) {}

  private key(k: string) {
    return `${this.ns}:${k}`;
  }

  async runOnce<T>(key: string, lockTtlMs: number, fn: () => Promise<T>): Promise<{ skipped: true } | { skipped: false; result: T }> {
    const k = this.key(key);
    if ((await this.redis.get(k)) === 'done') return { skipped: true };

    const locked = await this.redis.set(k, 'running', 'PX', lockTtlMs, 'NX');
    if (!locked) {
      if ((await this.redis.get(k)) === 'done') return { skipped: true };
      throw new TaskInProgressError(`Tac vu ${key} dang duoc tien trinh khac chay`);
    }
    try {
      const result = await fn();
      await this.redis.set(k, 'done', 'EX', this.doneTtlSec);
      return { skipped: false, result };
    } catch (err) {
      await this.redis.del(k);
      throw err;
    }
  }
}

import type { Redis } from 'ioredis';
import type { QueueKey } from '../config/queues.config.js';

const BUCKET_MS = 5_000;
export type MetricKind = 'completed' | 'failed' | 'deadLetter';

/**
 * Bo dem theo khe 5 giay trong Redis (moi tien trinh worker cung ghi) -> ti le loi/thong luong
 * trong cua so truot bat ky, khong phu thuoc viec job hoan tat da bi xoa khoi hang doi hay chua.
 */
export class QueueMetrics {
  constructor(
    private readonly redis: Redis,
    private readonly ns: string,
  ) {}

  private bucketKey(queue: QueueKey, kind: MetricKind, bucket: number) {
    return `${this.ns}:metrics:${queue}:${kind}:${bucket}`;
  }

  async record(queue: QueueKey, kind: MetricKind) {
    const key = this.bucketKey(queue, kind, Math.floor(Date.now() / BUCKET_MS));
    await this.redis.multi().incr(key).pexpire(key, 2 * 3600_000).exec();
  }

  async window(queue: QueueKey, windowMs: number) {
    const now = Math.floor(Date.now() / BUCKET_MS);
    const buckets = Array.from({ length: Math.max(1, Math.ceil(windowMs / BUCKET_MS)) }, (_, i) => now - i);
    const sum = async (kind: MetricKind) => {
      const values = await this.redis.mget(...buckets.map((b) => this.bucketKey(queue, kind, b)));
      return values.reduce((s, v) => s + Number(v ?? 0), 0);
    };
    const [completed, failed, deadLetter] = await Promise.all([sum('completed'), sum('failed'), sum('deadLetter')]);
    const attempts = completed + failed;
    return { completed, failed, deadLetter, attempts, failureRate: attempts ? failed / attempts : 0 };
  }

  /** Nhip tim cua viec dinh ky: thoi diem chay thanh cong gan nhat. */
  async heartbeat(scheduleId: string) {
    await this.redis.hset(`${this.ns}:heartbeat`, scheduleId, Date.now());
  }

  async lastSuccess(scheduleId: string): Promise<number | null> {
    const v = await this.redis.hget(`${this.ns}:heartbeat`, scheduleId);
    return v ? Number(v) : null;
  }
}

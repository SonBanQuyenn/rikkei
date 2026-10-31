import type { Redis } from 'ioredis';

export const SENT_MARKER_TTL_SEC = 30 * 24 * 3600;

/**
 * Dau "da gui" cho tung don, tach rieng khoi job (job bi xoa ngay khi xong, dau nay thi khong).
 * Moi dau chi vai chuc byte va co TTL -> Redis khong phinh.
 */
export class EmailIdempotencyStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSec = SENT_MARKER_TTL_SEC,
  ) {}

  static key(orderId: string) {
    return `email:confirmation:sent:${orderId}`;
  }

  /** Khoa idempotency gui kem nha cung cap - cung don => cung khoa o moi lan thu. */
  static providerKey(orderId: string) {
    return `order-confirmation-${orderId}`;
  }

  async sentMessageId(orderId: string): Promise<string | null> {
    return this.redis.get(EmailIdempotencyStore.key(orderId));
  }

  async markSent(orderId: string, messageId: string) {
    await this.redis.set(EmailIdempotencyStore.key(orderId), messageId, 'EX', this.ttlSec);
  }
}

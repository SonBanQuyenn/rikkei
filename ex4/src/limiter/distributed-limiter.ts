import type { Decision } from './coordinator.js';

/** Cach mot tien trinh gateway hoi bo dieu phoi (IPC, TCP, Redis...). */
export interface CoordinatorTransport {
  acquire(key: string): Promise<Decision>;
}

export type SendResult<T> = { sent: true; result: T; decision: Decision } | { sent: false; decision: Decision };

/**
 * Chay trong moi tien trinh gateway, hoi bo dieu phoi chung cho tung giao dich.
 *
 * Khi bo dieu phoi khong tra loi kip (`timeoutMs`) -> TU CHOI (fail-closed).
 * Khong tu cap han muc cuc bo: neu chi 1 tien trinh mat ket noi ma tu cho qua 500 req/s
 * trong khi 5 tien trinh con lai van dung du han muc qua bo dieu phoi, tong se vuot nguong.
 * Neu bo dieu phoi da kip ghi nhan nhung tra loi tre, ta chi bo phi mot khe (an toan), khong bao gio vuot.
 */
export class DistributedLimiter {
  constructor(
    private readonly transport: CoordinatorTransport,
    private readonly timeoutMs: number,
  ) {}

  async acquire(key: string): Promise<Decision> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), this.timeoutMs)));
    try {
      const decision = await Promise.race([this.transport.acquire(key).catch(() => null), timeout]);
      return decision ?? { allowed: false, delayMs: 0, retryAfterMs: this.timeoutMs, source: 'unavailable' };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Xin khe gui, cho dung khe roi moi goi sang ngan hang. */
  async send<T>(key: string, call: () => T | Promise<T>): Promise<SendResult<T>> {
    const decision = await this.acquire(key);
    if (!decision.allowed) return { sent: false, decision };
    if (decision.delayMs > 0) await new Promise((r) => setTimeout(r, decision.delayMs));
    return { sent: true, result: await call(), decision };
  }
}

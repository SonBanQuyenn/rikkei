import { randomInt } from 'node:crypto';
import type { CacheMetrics } from './cache-metrics.js';
import { epochKeyOf, type CachePolicy } from './cache-policies.js';
import type { RedisCacheClient } from './redis-cache.client.js';

/**
 * Cache-aside dung chung cho moi loai du lieu: tang nghiep vu chi khai bao chinh sach + ham nap tu CSDL.
 * - Redis loi/cham -> di thang CSDL (cham di, khong sap).
 * - Nap trung khoa trong cung instance duoc gop thanh mot lan (single-flight).
 * - Vo hieu hoa that bai (Redis dang sap) duoc ghi nho va thu lai, va khoa do khong duoc doc tu Redis cho toi khi xoa xong.
 */
export class CacheService {
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly pendingInvalidations = new Map<string, string | undefined>();

  constructor(
    private readonly client: RedisCacheClient,
    private readonly metrics: CacheMetrics,
    private readonly enabled = true,
  ) {}

  async getOrLoad<A extends unknown[], T>(policy: CachePolicy<A>, args: A, loader: () => Promise<T>): Promise<T> {
    if (!this.enabled) return loader();
    const key = policy.key(...args);

    await this.retryPendingInvalidations();
    if (this.pendingInvalidations.has(key)) {
      this.metrics.bypass(policy.kind);
      return loader();
    }

    const cached = await this.client.get(key);
    if (cached.ok && cached.value !== null) {
      this.metrics.hit(policy.kind);
      return JSON.parse(cached.value) as T;
    }
    if (cached.ok) this.metrics.miss(policy.kind);
    else this.metrics.bypass(policy.kind);

    return this.singleFlight(key, () => this.loadAndStore(policy, key, loader, cached.ok));
  }

  async invalidate<A extends unknown[]>(policy: CachePolicy<A>, args: A): Promise<void> {
    if (!this.enabled) return;
    const key = policy.key(...args);
    // Lan nap dang chay co the da doc du lieu cu -> request den sau khong duoc ghep vao no nua
    this.inflight.delete(key);
    const epochKey = policy.guardWrites ? epochKeyOf(key) : undefined;
    const result = await this.client.invalidate(key, epochKey);
    if (!result.ok) this.pendingInvalidations.set(key, epochKey);
  }

  get pendingInvalidationCount() {
    return this.pendingInvalidations.size;
  }

  private async loadAndStore<A extends unknown[], T>(
    policy: CachePolicy<A>,
    key: string,
    loader: () => Promise<T>,
    redisUp: boolean,
  ): Promise<T> {
    // Doc epoch TRUOC khi doc CSDL: neu co ghi + vo hieu hoa xen giua, epoch doi -> khong ghi gia tri cu
    const epoch = redisUp && policy.guardWrites ? await this.client.get(epochKeyOf(key)) : undefined;
    const value = await loader();
    if (!redisUp || value === undefined || value === null) return value;

    const ttl = policy.ttlSec + (policy.jitterSec ? randomInt(0, policy.jitterSec + 1) : 0);
    const json = JSON.stringify(value);
    if (!policy.guardWrites) await this.client.set(key, json, ttl);
    else if (epoch?.ok) await this.client.setIfEpoch(key, epochKeyOf(key), epoch.value ?? '0', json, ttl);
    return value;
  }

  private singleFlight<T>(key: string, load: () => Promise<T>): Promise<T> {
    const running = this.inflight.get(key);
    if (running) return running as Promise<T>;
    const p = load().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async retryPendingInvalidations() {
    if (this.pendingInvalidations.size === 0 || this.client.state === 'open') return;
    for (const [key, epochKey] of this.pendingInvalidations) {
      if (!(await this.client.invalidate(key, epochKey)).ok) return;
      this.pendingInvalidations.delete(key);
    }
  }
}

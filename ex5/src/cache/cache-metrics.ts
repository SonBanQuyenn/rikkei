import type { DataKind } from './cache-policies.js';

type Counter = { hits: number; misses: number; bypass: number };

export type KindStats = Counter & { requests: number; hitRatio: number };

/** Dem trung / truot / bo qua (Redis khong san sang) theo tung loai du lieu. */
export class CacheMetrics {
  private readonly counters = new Map<DataKind, Counter>();

  hit(kind: DataKind) {
    this.counter(kind).hits++;
  }

  miss(kind: DataKind) {
    this.counter(kind).misses++;
  }

  bypass(kind: DataKind) {
    this.counter(kind).bypass++;
  }

  snapshot(): Record<string, KindStats> {
    const out: Record<string, KindStats> = {};
    for (const [kind, c] of this.counters) {
      const requests = c.hits + c.misses + c.bypass;
      out[kind] = { ...c, requests, hitRatio: requests ? Number((c.hits / requests).toFixed(4)) : 0 };
    }
    return out;
  }

  reset() {
    this.counters.clear();
  }

  private counter(kind: DataKind): Counter {
    let c = this.counters.get(kind);
    if (!c) this.counters.set(kind, (c = { hits: 0, misses: 0, bypass: 0 }));
    return c;
  }
}

import { LeakyBucket as LeakyBucketScheduler } from '../limiter/leaky-bucket.js';
import { SlidingLog } from './sliding-log.js';

/**
 * Giao dien chung de so sanh: tra ve thoi diem giao dich THUC SU duoc gui sang ngan hang,
 * hoac null neu bi chan. (Gao ro xep hang nen thoi diem gui co the muon hon thoi diem den.)
 */
export interface Algorithm {
  tryAcquire(now: number): number | null;
}

/** (a) Cua so co dinh: dem theo giay lich [k*1000, (k+1)*1000). */
export class FixedWindow implements Algorithm {
  private window = -1;
  private count = 0;
  constructor(private readonly limit: number) {}
  tryAcquire(now: number) {
    const w = Math.floor(now / 1000);
    if (w !== this.window) {
      this.window = w;
      this.count = 0;
    }
    if (this.count >= this.limit) return null;
    this.count++;
    return now;
  }
}

/** (b) Nhat ky cua so truot. */
export class SlidingLogAlgorithm implements Algorithm {
  private log: SlidingLog;
  constructor(limit: number) {
    this.log = new SlidingLog(limit, 1000);
  }
  tryAcquire(now: number) {
    return this.log.tryAcquire(now) === 0 ? now : null;
  }
}

/** (c) Bo dem cua so truot: uoc luong = prev * phan con lai + curr. */
export class SlidingWindowCounter implements Algorithm {
  private window = -1;
  private prev = 0;
  private curr = 0;
  constructor(private readonly limit: number) {}
  tryAcquire(now: number) {
    const w = Math.floor(now / 1000);
    if (w !== this.window) {
      this.prev = w === this.window + 1 ? this.curr : 0;
      this.curr = 0;
      this.window = w;
    }
    const estimated = this.prev * ((1000 - (now - w * 1000)) / 1000) + this.curr;
    if (estimated >= this.limit) return null;
    this.curr++;
    return now;
  }
}

/** (d) Gao token: nap `rate` token/giay, chua toi da `capacity`. */
export class TokenBucket implements Algorithm {
  private tokens: number;
  private last = 0;
  constructor(
    private readonly rate: number,
    private readonly capacity: number,
  ) {
    this.tokens = capacity;
  }
  tryAcquire(now: number) {
    this.tokens = Math.min(this.capacity, this.tokens + ((now - this.last) * this.rate) / 1000);
    this.last = now;
    if (this.tokens < 1) return null;
    this.tokens--;
    return now;
  }
}

/** (e) Gao ro dang hang doi (giai phap duoc chon): xa deu `rate` giao dich/giay, tre toi da `maxDelayMs`. */
export class LeakyBucket implements Algorithm {
  private scheduler: LeakyBucketScheduler;
  constructor(rate: number, maxDelayMs: number) {
    this.scheduler = new LeakyBucketScheduler(rate, maxDelayMs);
  }
  tryAcquire(now: number) {
    const delay = this.scheduler.schedule(now);
    return delay === null ? null : now + delay;
  }
}

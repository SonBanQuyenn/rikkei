import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { BYTES_PER_KEY, Coordinator, type Decision } from '../src/limiter/coordinator.js';
import { DistributedLimiter } from '../src/limiter/distributed-limiter.js';
import { LeakyBucket } from '../src/limiter/leaky-bucket.js';
import { maxInAnyWindow } from '../src/limiter/window-stats.js';

/** Sinh `rate` thoi diem den ngau nhien moi giay (hat giong co dinh). */
function traffic(seconds: number, rateAt: (s: number) => number, seed = 7) {
  const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const times: number[] = [];
  for (let s = 0; s < seconds; s++) {
    times.push(...Array.from({ length: rateAt(s) }, () => s * 1000 + rand() * 1000).sort((a, b) => a - b));
  }
  return times;
}

describe('maxInAnyWindow', () => {
  test('dem dung so phan tu lon nhat trong cua so truot [t, t+1000)', () => {
    assert.equal(maxInAnyWindow([0, 500, 999, 1000, 1499], 1000), 4); // [500, 1500)
    assert.equal(maxInAnyWindow([0, 999, 1999], 1000), 2);
    assert.equal(maxInAnyWindow([900, 950, 1050, 1100], 1000), 4);
    assert.equal(maxInAnyWindow([], 1000), 0);
  });
});

describe('LeakyBucket', () => {
  test('BAY 1 - dot bien 20h-22h: 5.000 req/s trong 30s khong bao gio vuot 3.000 trong 1 giay truot bat ky', () => {
    const bucket = new LeakyBucket(2940, 100);
    const sent: number[] = [];
    let maxDelay = 0;
    let rejectedNormal = 0;
    for (const t of traffic(90, (s) => (s >= 30 && s < 60 ? 5000 : 2000))) {
      const delay = bucket.schedule(t);
      if (delay === null) {
        if (t < 30_000) rejectedNormal++;
        continue;
      }
      sent.push(t + delay);
      maxDelay = Math.max(maxDelay, delay);
    }
    assert.ok(maxInAnyWindow(sent, 1000) <= 3000);
    assert.ok(maxDelay <= 100);
    // Giai doan binh thuong khong chan oan giao dich nao
    assert.equal(rejectedNormal, 0);
  });

  test('xung ngan duoi suc chua hang doi duoc hap thu - khong chan oan', () => {
    const bucket = new LeakyBucket(3000, 100);
    // 250 giao dich den cung 1ms: can 250 * 0.333ms = 83ms de xa het < 100ms
    const results = Array.from({ length: 250 }, () => bucket.schedule(1000));
    assert.ok(results.every((d) => d !== null));
  });

  test('hang doi day -> chan va cho biet bao lau nua thu lai', () => {
    const bucket = new LeakyBucket(1000, 10); // khe 1ms, tre toi da 10ms
    for (let i = 0; i < 11; i++) assert.notEqual(bucket.schedule(0), null);
    assert.equal(bucket.schedule(0), null);
    assert.equal(bucket.retryAfter(0), 1);
  });

  test('dong ho lui khong pha vo khoang cach giua cac lan gui', () => {
    const bucket = new LeakyBucket(1000, 1000);
    const sent = [5000, 4000, 4500].map((t) => {
      const d = bucket.schedule(t)!;
      return Math.max(t, 5000) + d;
    });
    assert.deepEqual(sent, [5000, 5001, 5002]);
  });

  test('tham so sai bi tu choi ngay khi khoi tao', () => {
    assert.throws(() => new LeakyBucket(0, 100), RangeError);
    assert.throws(() => new LeakyBucket(100, -1), RangeError);
  });
});

describe('Coordinator - dong bo 6 tien trinh', () => {
  test('6 tien trinh chia tai khong deu cung hoi mot bo dieu phoi -> tong van <= 3.000 / giay truot', () => {
    const coordinator = new Coordinator({ rate: 2940, maxDelayMs: 100 });
    const shares = [0.25, 0.2, 0.15, 0.15, 0.15, 0.1];
    const events = shares.flatMap((share, p) => traffic(20, () => Math.round(5000 * share), p + 1).map((t) => ({ t, p })));
    events.sort((a, b) => a.t - b.t);
    const sent: number[] = [];
    const perProcess = new Array(6).fill(0);
    for (const { t, p } of events) {
      const d = coordinator.acquire('bank:A', t);
      if (!d.allowed) continue;
      sent.push(t + d.delayMs);
      perProcess[p]++;
    }
    assert.ok(maxInAnyWindow(sent, 1000) <= 3000);
    // Tien trinh nhan nhieu tai duoc dung nhieu han muc hon (khong chia cung 500/tien trinh)
    assert.ok(perProcess[0] > 3000 / 6 * 20);
  });

  test('BAY 2 - 256MB: ngan sach 128MB du cho > 500.000 khoa, 100.000 khoa that do duoc < 64MB', () => {
    const coordinator = new Coordinator({ rate: 3000, maxDelayMs: 100 });
    assert.equal(coordinator.maxKeys, Math.floor((128 * 1024 * 1024) / BYTES_PER_KEY));

    globalThis.gc?.();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 100_000; i++) coordinator.acquire(`merchant:${i}`, 0);
    const used = process.memoryUsage().heapUsed - before;
    assert.equal(coordinator.keyCount, 100_000);
    assert.ok(used < 64 * 1024 * 1024, `100.000 khoa ton ${(used / 1048576).toFixed(1)}MB`);
  });

  test('BAY 2 - het ngan sach: don khoa nhan roi; van day thi tu choi chu khong cap phat them', () => {
    const coordinator = new Coordinator({ rate: 10, maxDelayMs: 1000, memoryBudgetBytes: 3 * BYTES_PER_KEY });
    for (const key of ['a', 'b', 'c']) assert.equal(coordinator.acquire(key, 0).allowed, true);
    // t = 50ms: 3 khoa con dang trong hang doi (khe ke tiep o 100ms) -> khong xoa duoc
    assert.equal(coordinator.acquire('d', 50).allowed, false);
    assert.equal(coordinator.keyCount, 3);
    // t = 200ms: ca 3 da nhan roi -> duoc don, khoa moi vao duoc
    assert.equal(coordinator.acquire('d', 200).allowed, true);
    assert.equal(coordinator.keyCount, 1);
  });
});

describe('DistributedLimiter - phia tien trinh gateway', () => {
  const ok: Decision = { allowed: true, delayMs: 20, retryAfterMs: 0, source: 'central' };

  test('cho dung khe duoc cap roi moi goi ngan hang', async () => {
    const limiter = new DistributedLimiter({ acquire: async () => ok }, 100);
    const start = performance.now();
    const r = await limiter.send('bank:A', () => performance.now() - start);
    assert.equal(r.sent, true);
    assert.ok(r.sent && r.result >= 15);
  });

  test('bo dieu phoi khong tra loi -> tu choi (fail-closed), khong tu cho qua', async () => {
    const limiter = new DistributedLimiter({ acquire: () => new Promise<Decision>(() => {}) }, 30);
    let called = false;
    const r = await limiter.send('bank:A', () => (called = true));
    assert.equal(r.sent, false);
    assert.equal(r.decision.source, 'unavailable');
    assert.equal(called, false);
  });

  test('loi ket noi -> tu choi, khong nem loi ra ngoai', async () => {
    const limiter = new DistributedLimiter({ acquire: () => Promise.reject(new Error('ECONNRESET')) }, 30);
    const d = await limiter.acquire('bank:A');
    assert.equal(d.allowed, false);
    assert.equal(d.source, 'unavailable');
  });
});

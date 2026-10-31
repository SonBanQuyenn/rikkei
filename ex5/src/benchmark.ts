/**
 * Do hieu nang truoc/sau tang tang toc voi cung mot luong truy cap gio cao diem (sinh ngau nhien co dinh hat giong):
 * 25% xem danh muc, 40% xem san pham (80% vao 20 san pham hot), 15% xem gio, 3% them vao gio,
 * 15% xem top ban chay, 2% doi gia san pham hot.
 * Kich ban 3: Redis treo hoan toan (moi lenh khong bao gio tra loi).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import RedisMock from 'ioredis-mock';
import type { RedisLike } from './cache/redis-cache.client.js';
import { createShop, type Shop } from './container.js';
import type { Table } from './data/fake-db.js';

const TOTAL_OPS = 6_000;
const CONCURRENCY = 50;

/** Redis "sap": lenh khong bao gio tra loi (truong hop te nhat - phai nho timeout). */
const hangingRedis: RedisLike = {
  get: () => new Promise(() => {}),
  set: () => new Promise(() => {}),
  del: () => new Promise(() => {}),
  incr: () => new Promise(() => {}),
  eval: () => new Promise(() => {}),
};

function rng(seed: number) {
  return () => {
    seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

type PriceHistory = Map<string, { price: number; from: number }[]>;

/** Gia doc ra phai la gia dung tai mot thoi diem nao do trong khoang [bat dau, ket thuc] cua request. */
function isFresh(history: PriceHistory, id: string, price: number, start: number, end: number) {
  const entries = history.get(id)!;
  return entries.some((e, i) => e.price === price && e.from <= end && (entries[i + 1]?.from ?? Infinity) >= start);
}

async function run(label: string, shop: Shop) {
  const random = rng(42);
  const history: PriceHistory = new Map([...shop.db.products.values()].map((p) => [p.id, [{ price: p.price, from: 0 }]]));
  const hot = [...shop.db.products.keys()].slice(0, 20);
  const all = [...shop.db.products.keys()];
  const categories = ['all', ...shop.db.categories];
  const pick = <T>(xs: T[]) => xs[Math.floor(random() * xs.length)];
  let stale = 0;
  let errors = 0;

  const ops: (() => Promise<void>)[] = Array.from({ length: TOTAL_OPS }, () => {
    const r = random();
    const product = random() < 0.8 ? pick(hot) : pick(all);
    const user = `u${Math.floor(random() * 2_000)}`;
    if (r < 0.25) return async () => void (await shop.catalog.categories());
    if (r < 0.65)
      return async () => {
        const start = performance.now();
        const p = await shop.products.findOne(product);
        if (!isFresh(history, p.id, p.price, start, performance.now())) stale++;
      };
    if (r < 0.8) return async () => void (await shop.carts.view(user));
    if (r < 0.83) return async () => void (await shop.carts.add(user, product, 1));
    if (r < 0.98) return async () => void (await shop.reports.topSellers(pick(categories)));
    const target = pick(hot);
    const newPrice = 100_000 + Math.floor(random() * 900) * 1_000;
    return async () => {
      await shop.products.updatePrice(target, newPrice);
      history.get(target)!.push({ price: newPrice, from: performance.now() });
    };
  });

  const latencies: number[] = [];
  let next = 0;
  const started = performance.now();
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < ops.length) {
        const op = ops[next++];
        const t = performance.now();
        try {
          await op();
        } catch {
          errors++;
        }
        latencies.push(performance.now() - t);
      }
    }),
  );
  const elapsed = performance.now() - started;
  latencies.sort((a, b) => a - b);
  const pct = (p: number) => latencies[Math.floor((p / 100) * latencies.length)].toFixed(1);

  return {
    label,
    elapsedMs: Math.round(elapsed),
    throughput: Math.round((TOTAL_OPS / elapsed) * 1000),
    p50: pct(50),
    p95: pct(95),
    p99: pct(99),
    dbQueries: { ...shop.db.queries } as Record<Table, number>,
    dbTotal: shop.db.totalQueries(),
    dbBusyMs: shop.db.busyMs,
    errors,
    stale,
    byKind: shop.metrics.snapshot(),
    redisState: shop.client.state,
  };
}

const before = await run('TRUOC - khong co tang dem', createShop({ redis: new RedisMock() as unknown as RedisLike, cacheEnabled: false }));
const after = await run('SAU - co tang tang toc', createShop({ redis: new RedisMock() as unknown as RedisLike }));
const down = await run('SAU - Redis treo hoan toan', createShop({ redis: hangingRedis }));

const fmt = (r: typeof before) => [
  `## ${r.label}`,
  `thoi gian: ${r.elapsedMs} ms | thong luong: ${r.throughput} req/s | loi: ${r.errors} | doc gia sai: ${r.stale}`,
  `do tre (ms): p50=${r.p50} p95=${r.p95} p99=${r.p99}`,
  `truy van CSDL: tong ${r.dbTotal} | ${Object.entries(r.dbQueries).map(([t, n]) => `${t}=${n}`).join(' ')}`,
  `thoi gian CSDL ban (chi phi): ${r.dbBusyMs} ms`,
  `trang thai Redis: ${r.redisState}`,
  ...Object.entries(r.byKind).map(
    ([kind, s]) => `  ${kind.padEnd(10)} requests=${s.requests} hit=${s.hits} miss=${s.misses} bypass=${s.bypass} ti le trung=${(s.hitRatio * 100).toFixed(1)}%`,
  ),
];

const reduction = (a: number, b: number) => `${(((a - b) / a) * 100).toFixed(1)}%`;
const output = [
  `# ShopFast - ${TOTAL_OPS} request, ${CONCURRENCY} request dong thoi, ${new Date().toISOString()}`,
  '',
  ...fmt(before),
  '',
  ...fmt(after),
  '',
  ...fmt(down),
  '',
  '## Tong ket',
  `truy van CSDL giam: ${before.dbTotal} -> ${after.dbTotal} (${reduction(before.dbTotal, after.dbTotal)})`,
  `chi phi CSDL giam: ${before.dbBusyMs} -> ${after.dbBusyMs} ms (${reduction(before.dbBusyMs, after.dbBusyMs)})`,
  `p95 do tre: ${before.p95} -> ${after.p95} ms`,
  `Redis treo: ${down.errors} loi, p95 ${down.p95} ms (xap xi khong co tang dem ${before.p95} ms)`,
];

console.log(output.join('\n'));
mkdirSync('logs', { recursive: true });
writeFileSync('logs/benchmark.log', output.join('\n') + '\n');
process.exit(0);

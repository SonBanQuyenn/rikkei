/**
 * Mo phong flash sale: 400 luot dat hang/giay vao cung mot san pham trong 2 giay (800 don, kho 600).
 * CSDL: dong products chi chiu ~150 lan ghi/giay. So sanh 3 giai phap + kich ban Redis khoi dong lai va huy don.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { InventoryDb } from './db/inventory.db.js';
import { InventoryService } from './inventory/inventory.service.js';
import { StockCache } from './inventory/stock-cache.js';
import { StockSyncWorker } from './inventory/stock-sync.worker.js';
import { DirectDbStrategy, WriteThroughStrategy } from './strategies/alternatives.js';

const PRODUCT = 'FS-001';
const INITIAL_STOCK = 600;
const RATE_PER_SEC = 400;
const DURATION_SEC = 2;
const TICK_MS = 10;

type PlaceOrder = (userId: string) => Promise<string>;
type Hooks = { atTick?: (tick: number, confirmed: string[]) => void };

const redis = new RedisMock() as unknown as Redis;

function percentile(values: number[], p: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

async function load(place: PlaceOrder, hooks: Hooks = {}) {
  const latencies: number[] = [];
  const confirmed: string[] = [];
  let outOfStock = 0;
  let errors = 0;
  const pending: Promise<void>[] = [];
  const perTick = (RATE_PER_SEC * TICK_MS) / 1000;
  const ticks = (DURATION_SEC * 1000) / TICK_MS;

  for (let tick = 0; tick < ticks; tick++) {
    hooks.atTick?.(tick, confirmed);
    for (let i = 0; i < perTick; i++) {
      const started = performance.now();
      pending.push(
        place(`u${tick}-${i}`)
          .then((id) => void confirmed.push(id))
          .catch((e: { status?: number }) => void (e.status === 409 ? outOfStock++ : errors++))
          .finally(() => void latencies.push(performance.now() - started)),
      );
    }
    await sleep(TICK_MS);
  }
  await Promise.all(pending);
  return { latencies, confirmed, outOfStock, errors };
}

function report(label: string, db: InventoryDb, r: Awaited<ReturnType<typeof load>>, extra: string[] = []) {
  const dbStock = db.products.get(PRODUCT)!.stock;
  const sold = db.soldQty(PRODUCT);
  return [
    `## ${label}`,
    `don gui: ${r.latencies.length} | thanh cong: ${r.confirmed.length} | het hang: ${r.outOfStock} | loi: ${r.errors}`,
    `do tre (ms): p50=${percentile(r.latencies, 50).toFixed(0)} p95=${percentile(r.latencies, 95).toFixed(0)} p99=${percentile(r.latencies, 99).toFixed(0)} max=${Math.max(...r.latencies).toFixed(0)}`,
    `so lan ghi dong products: ${db.hotRowWrites}`,
    `ton kho CSDL cuoi: ${dbStock} | da ban (don CONFIRMED): ${sold} | ${INITIAL_STOCK} - ${sold} = ${INITIAL_STOCK - sold} -> ${dbStock === INITIAL_STOCK - sold ? 'KHOP' : 'LECH'}`,
    `ban vuot ton kho: ${sold > INITIAL_STOCK ? `CO (${sold - INITIAL_STOCK})` : 'khong'}`,
    ...extra,
  ];
}

function freshDb() {
  const db = new InventoryDb();
  db.seedProduct(PRODUCT, INITIAL_STOCK);
  return db;
}

async function runDirect() {
  await redis.flushall();
  const db = freshDb();
  const s = new DirectDbStrategy(db);
  return report('(a) Ghi thang CSDL', db, await load((u) => s.placeOrder(PRODUCT, u, 1)));
}

async function runWriteThrough() {
  await redis.flushall();
  const db = freshDb();
  const cache = new StockCache(redis);
  await cache.writeRebuild(PRODUCT, INITIAL_STOCK, []);
  const s = new WriteThroughStrategy(db, cache);
  return report('(b) Ghi dong thoi Redis + CSDL', db, await load((u) => s.placeOrder(PRODUCT, u, 1)));
}

async function runChosen(withTraps: boolean) {
  await redis.flushall();
  const db = freshDb();
  const service = new InventoryService(db, new StockCache(redis));
  const worker = new StockSyncWorker(db, 1_000);
  worker.start();

  const cancels: Promise<unknown>[] = [];
  let restarted = false;
  const hooks: Hooks = withTraps
    ? {
        atTick: (tick, confirmed) => {
          // Redis khoi dong lai giua chien dich (mat toan bo du lieu)
          if (tick === 100) {
            restarted = true;
            void redis.flushall();
          }
          // Khach huy 1 don moi 20ms trong suot chien dich
          if (tick % 2 === 0 && confirmed.length > 0) cancels.push(service.cancelOrder(confirmed.shift()!));
        },
      }
    : {};

  const result = await load((u) => service.placeOrder(PRODUCT, u, 1).then((o) => o.orderId), hooks);
  await Promise.all(cancels);
  await worker.stop();

  const extra = withTraps
    ? [
        `Redis khoi dong lai giua chung: ${restarted ? 'co' : 'khong'} | don bi huy: ${cancels.length}`,
        `ton kho kha dung trong Redis cuoi: ${await service.available(PRODUCT)} (phai bang ton kho CSDL)`,
      ]
    : [];
  const label = withTraps ? '(c) DA CHON + bay: Redis khoi dong lai, huy don giua chung' : '(c) DA CHON: Redis tru kho nguyen tu + ghi don CSDL + dong bo dong ton kho theo lo';
  return report(label, db, result, extra);
}

const output = [
  `# Flash sale: ${RATE_PER_SEC} don/giay x ${DURATION_SEC}s, kho ${INITIAL_STOCK}, dong products chiu ~150 ghi/giay, ${new Date().toISOString()}`,
  '',
  ...(await runDirect()),
  '',
  ...(await runWriteThrough()),
  '',
  ...(await runChosen(false)),
  '',
  ...(await runChosen(true)),
];

console.log(output.join('\n'));
mkdirSync('logs', { recursive: true });
writeFileSync('logs/benchmark.log', output.join('\n') + '\n');
process.exit(0);

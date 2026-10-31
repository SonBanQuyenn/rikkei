import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app.js';
import { InventoryDb } from '../src/db/inventory.db.js';
import { InventoryService } from '../src/inventory/inventory.service.js';
import { StockCache, heldKey, provisionalKey, stockKey } from '../src/inventory/stock-cache.js';
import { StockSyncWorker } from '../src/inventory/stock-sync.worker.js';

const P = 'FS-001';
let redis: Redis;
let db: InventoryDb;
let service: InventoryService;
let worker: StockSyncWorker;

beforeEach(async () => {
  redis = new RedisMock() as unknown as Redis;
  await redis.flushall();
  db = new InventoryDb();
  service = new InventoryService(db, new StockCache(redis));
  worker = new StockSyncWorker(db, 200);
});

afterEach(async () => {
  await worker.stop();
  redis.disconnect();
});

const place = (n: number, qty = 1) =>
  Promise.allSettled(Array.from({ length: n }, (_, i) => service.placeOrder(P, `u${i}`, qty)));
const fulfilled = <T>(rs: PromiseSettledResult<T>[]) =>
  rs.filter((r): r is PromiseFulfilledResult<T> => r.status === 'fulfilled').map((r) => r.value);

/** Bat bien: ton kho CSDL (sau khi dong bo xong) = ban dau - tong don CONFIRMED, va Redis = CSDL. */
async function assertConsistent(initial: number) {
  await worker.stop();
  const sold = db.soldQty(P);
  assert.ok(sold <= initial, `ban vuot: ${sold} > ${initial}`);
  assert.equal(db.products.get(P)!.stock, initial - sold);
  assert.equal(await service.available(P), initial - sold);
}

describe('Khong ban vuot ton kho', () => {
  test('300 don dong thoi, kho 200 -> dung 200 don thanh cong, 100 don het hang', async () => {
    db.seedProduct(P, 200);
    const rs = await place(300);
    assert.equal(fulfilled(rs).length, 200);
    assert.ok(rs.filter((r) => r.status === 'rejected').every((r) => (r as PromiseRejectedResult).reason.status === 409));
    await assertConsistent(200);
    assert.equal(db.products.get(P)!.stock, 0);
  });

  test('don nhieu san pham: khong du so luong thi tu choi ca don, khong tru le', async () => {
    db.seedProduct(P, 7);
    const rs = await place(3, 3);
    assert.equal(fulfilled(rs).length, 2);
    assert.equal(await service.available(P), 1);
    await assertConsistent(7);
  });

  test('400 don/giay -> phan hoi duoi 500ms, dong products chi bi ghi theo lo', async () => {
    db.seedProduct(P, 1_000);
    worker.start();
    const latencies: number[] = [];
    const all: Promise<unknown>[] = [];
    for (let tick = 0; tick < 100; tick++) {
      for (let i = 0; i < 4; i++) {
        const t = performance.now();
        all.push(service.placeOrder(P, `u${tick}-${i}`, 1).finally(() => latencies.push(performance.now() - t)));
      }
      await sleep(10);
    }
    await Promise.all(all);
    assert.ok(Math.max(...latencies) < 500, `max=${Math.max(...latencies).toFixed(0)}ms`);
    await assertConsistent(1_000);
    assert.ok(db.hotRowWrites < 20, `hotRowWrites=${db.hotRowWrites}`);
  });
});

describe('Bay: Redis khoi dong lai giua chien dich', () => {
  test('mat du lieu Redis giua chung -> dung lai tu CSDL, van khong ban vuot, cuoi cung khop tuyet doi', async () => {
    db.seedProduct(P, 150);
    worker.start();
    const first = place(100);
    await sleep(5);
    await redis.flushall(); // Redis khoi dong lai khi con 100 don dang xu ly
    const second = place(100);
    const rs = [...(await first), ...(await second)];
    assert.equal(fulfilled(rs).length, 150);
    await assertConsistent(150);
  });

  test('don da ghi PENDING nhung Redis mat truoc khi tru -> lan dung lai tinh don do, khong tru hai lan', async () => {
    db.seedProduct(P, 10);
    const order = await db.insertOrder(P, 'u1', 2);
    await service.rebuild(P); // don PENDING duoc tru tam
    assert.equal(await service.available(P), 8);
    assert.equal(await redis.sismember(provisionalKey(P), order.id), 1);
    const r = await new StockCache(redis).reserve(P, order.id, 2); // request cua don nay toi Redis moi
    assert.equal(r, 8, 'khong tru lan nua');
    assert.equal(await redis.sismember(heldKey(P), order.id), 1);
  });

  test('Redis trong khi dang co nhieu don PENDING vuot ton kho -> don tru tam van bi kiem tra, khong ban vuot', async () => {
    db.seedProduct(P, 3);
    const orders = await Promise.all(Array.from({ length: 5 }, (_, i) => db.insertOrder(P, `u${i}`, 1)));
    await service.rebuild(P); // 3 - 5 = -2
    const cache = new StockCache(redis);
    const results = [];
    for (const o of orders) results.push(await cache.reserve(P, o.id, 1));
    assert.equal(results.filter((r) => r >= 0).length, 3);
    assert.equal(await service.available(P), 0);
  });

  test('dung lai sau khi da dong bo mot phan va co don huy chua dong bo', async () => {
    db.seedProduct(P, 20);
    const ok = fulfilled(await place(10));
    await worker.flush(); // CSDL: 10
    await service.cancelOrder(ok[0].orderId); // chua dong bo -> CSDL van 10
    await service.cancelOrder(ok[1].orderId);
    fulfilled(await place(3)); // 3 don chua dong bo
    await redis.flushall();
    assert.equal(await service.available(P), 20 - 10 + 2 - 3);
    await assertConsistent(20);
  });
});

describe('Bay: don bi huy giua chung', () => {
  test('huy don -> hoan so luong, khach khac mua duoc dung so luong do', async () => {
    db.seedProduct(P, 5);
    const ok = fulfilled(await place(5));
    assert.equal((await place(1))[0].status, 'rejected');

    await service.cancelOrder(ok[0].orderId);
    await service.cancelOrder(ok[1].orderId);
    const again = await place(3);
    assert.equal(fulfilled(again).length, 2);
    await assertConsistent(5);
  });

  test('huy hai lan (hoac huy dong thoi) chi hoan mot lan', async () => {
    db.seedProduct(P, 5);
    const [o] = fulfilled(await place(1, 2));
    await Promise.all([service.cancelOrder(o.orderId), service.cancelOrder(o.orderId), service.cancelOrder(o.orderId)]);
    await service.cancelOrder(o.orderId);
    assert.equal(await service.available(P), 5);
    await assertConsistent(5);
  });

  test('huy don da dong bo xuong CSDL -> lan dong bo sau cong tra lai dong products', async () => {
    db.seedProduct(P, 5);
    const [o] = fulfilled(await place(1, 3));
    await worker.flush();
    assert.equal(db.products.get(P)!.stock, 2);
    await service.cancelOrder(o.orderId);
    await worker.flush();
    assert.equal(db.products.get(P)!.stock, 5);
  });

  test('huy don trong luc Redis vua mat du lieu -> van hoan dung mot lan', async () => {
    db.seedProduct(P, 5);
    const [o] = fulfilled(await place(1, 2));
    await redis.flushall();
    await service.cancelOrder(o.orderId);
    assert.equal(await service.available(P), 5);
    await assertConsistent(5);
  });
});

describe('Loi ghi CSDL', () => {
  test('ghi don loi -> khong tru kho', async () => {
    db.seedProduct(P, 5);
    db.failNextInsert = 1;
    await assert.rejects(service.placeOrder(P, 'u1', 1), /insert order failed/);
    assert.equal(await service.available(P), 5);
  });
});

describe('HTTP', () => {
  let app: INestApplication;
  afterEach(() => app?.close());

  test('POST /orders, POST /orders/:id/cancel, GET /products/:id/stock', async () => {
    const httpDb = new InventoryDb();
    httpDb.seedProduct(P, 2);
    app = await createApp({ redis, db: httpDb, logger: false });
    await app.listen(0);
    const url = `http://localhost:${app.getHttpServer().address().port}`;
    const order = (qty: number) =>
      fetch(`${url}/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId: P, userId: 'u1', qty }),
      });

    const res = await order(2);
    assert.equal(res.status, 201);
    const { orderId } = (await res.json()) as { orderId: string };
    assert.equal((await order(1)).status, 409);
    assert.equal((await order(99)).status, 400);
    assert.equal((await fetch(`${url}/orders/${orderId}/cancel`, { method: 'POST' })).status, 200);
    assert.deepEqual(await (await fetch(`${url}/products/${P}/stock`)).json(), { productId: P, available: 2 });
    assert.equal(await redis.get(stockKey(P)), '2');
  });
});

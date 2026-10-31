import { afterEach, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import RedisMock from 'ioredis-mock';
import type { INestApplication } from '@nestjs/common';
import { POLICIES, type CachePolicy } from '../src/cache/cache-policies.js';
import type { RedisLike } from '../src/cache/redis-cache.client.js';
import { createShop } from '../src/container.js';
import { FakeDb } from '../src/data/fake-db.js';
import { createApp } from '../src/http/app.js';

const FAST = { categories: 2, products: 5, carts: 2, orders: 20 };

/** Redis co the bat/tat: down=true -> moi lenh bi tu choi (mat ket noi), hang=true -> lenh treo mai. */
class FlakyRedis implements RedisLike {
  down = false;
  hang = false;
  constructor(readonly inner: RedisLike) {}
  private guard<T>(run: () => Promise<T>): Promise<T> {
    if (this.hang) return new Promise(() => {});
    if (this.down) return Promise.reject(new Error('ECONNREFUSED'));
    return run();
  }
  get(k: string) { return this.guard(() => this.inner.get(k)); }
  set(k: string, v: string, m: 'EX', t: number) { return this.guard(() => this.inner.set(k, v, m, t)); }
  del(...k: string[]) { return this.guard(() => this.inner.del(...k)); }
  incr(k: string) { return this.guard(() => this.inner.incr(k)); }
  eval(s: string, n: number, ...a: (string | number)[]) { return this.guard(() => this.inner.eval(s, n, ...a)); }
}

let mock: InstanceType<typeof RedisMock>;
let redis: FlakyRedis;

beforeEach(async () => {
  mock = new RedisMock();
  await mock.flushall();
  redis = new FlakyRedis(mock as unknown as RedisLike);
});
afterEach(() => mock.disconnect());

const shopWith = (redisOptions = {}) => createShop({ redis, db: new FakeDb(FAST), redisOptions });

describe('Chinh sach rieng cho tung loai du lieu', () => {
  const cases: [string, CachePolicy<any>, unknown[], number, number][] = [
    ['static', POLICIES.categories, [], 24 * 3600, 25 * 3600],
    ['product', POLICIES.product, ['P001'], 300, 360],
    ['user', POLICIES.cart, ['u1'], 1800, 1800],
    ['aggregate', POLICIES.topSellers, ['all'], 600, 720],
  ];

  test('lan 2 trung bo nho dem, khong xuong CSDL; TTL dung theo chinh sach', async () => {
    const shop = shopWith();
    const read = {
      static: () => shop.catalog.categories(),
      product: () => shop.products.findOne('P001'),
      user: () => shop.carts.view('u1'),
      aggregate: () => shop.reports.topSellers('all'),
    };
    for (const [kind, policy, args, minTtl, maxTtl] of cases) {
      await read[kind as keyof typeof read]();
      const before = shop.db.totalQueries();
      await read[kind as keyof typeof read]();
      assert.equal(shop.db.totalQueries(), before, `${kind}: lan 2 khong duoc xuong CSDL`);
      const ttl = await mock.ttl(policy.key(...args));
      assert.ok(ttl >= minTtl && ttl <= maxTtl, `${kind}: ttl=${ttl}`);
    }
    const stats = shop.metrics.snapshot();
    for (const kind of ['static', 'product', 'user', 'aggregate']) assert.equal(stats[kind].hits, 1, kind);
  });

  test('danh muc: admin sua -> xoa ban dem, doc lai thay ngay', async () => {
    const shop = shopWith();
    await shop.catalog.categories();
    await shop.catalog.updateCategories(['ao', 'quan']);
    assert.deepEqual(await shop.catalog.categories(), ['ao', 'quan']);
  });

  test('top ban chay: don moi khong xoa ban dem (chap nhan tre toi da 10-12 phut)', async () => {
    const shop = shopWith();
    const first = await shop.reports.topSellers('all');
    shop.db.orders.push({ productId: 'P200', qty: 10_000 });
    assert.deepEqual(await shop.reports.topSellers('all'), first);
  });
});

describe('Khong de khach thay gia sai', () => {
  test('doi gia -> trang san pham va gio hang thay gia moi ngay lap tuc', async () => {
    const shop = shopWith();
    await shop.carts.add('u1', 'P001', 2);
    await shop.products.findOne('P001');
    await shop.carts.view('u1');

    await shop.products.updatePrice('P001', 99_000);
    assert.equal((await shop.products.findOne('P001')).price, 99_000);
    const cart = await shop.carts.view('u1');
    assert.equal(cart.total, 198_000);
  });

  test('lan nap dang do doc gia cu, gia vua doi xong -> gia cu KHONG duoc ghi vao bo nho dem', async () => {
    const shop = shopWith();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slowRead = shop.cache.getOrLoad(POLICIES.product, ['P001'], async () => {
      const old = await shop.db.findProduct('P001'); // doc gia cu
      await gate; // ... bi cham lai
      return old;
    });
    await sleep(20);
    await shop.products.updatePrice('P001', 55_000); // ghi CSDL + vo hieu hoa trong luc lan nap kia dang cho
    release();
    await slowRead;

    assert.equal(await mock.get(POLICIES.product.key('P001')), null, 'gia cu khong duoc dem');
    assert.equal((await shop.products.findOne('P001')).price, 55_000);
  });

  test('request den sau khi doi gia khong ghep vao lan nap cu dang chay', async () => {
    const shop = shopWith();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    void shop.cache.getOrLoad(POLICIES.product, ['P001'], async () => {
      const old = await shop.db.findProduct('P001');
      await gate;
      return old;
    });
    await sleep(20);
    await shop.products.updatePrice('P001', 66_000);
    const fresh = shop.products.findOne('P001');
    release();
    assert.equal((await fresh).price, 66_000);
  });
});

describe('Du lieu rieng tung nguoi dung', () => {
  test('gio hang cua nguoi nay khong bao gio lot sang nguoi khac', async () => {
    const shop = shopWith();
    await shop.carts.add('u1', 'P001', 1);
    await shop.carts.add('u2', 'P002', 3);
    const [a, b] = [await shop.carts.view('u1'), await shop.carts.view('u2')];
    assert.deepEqual(a.items.map((i) => i.productId), ['P001']);
    assert.deepEqual(b.items.map((i) => i.productId), ['P002']);
    assert.notEqual(POLICIES.cart.key('u1'), POLICIES.cart.key('u2'));
  });
});

describe('Redis khong san sang -> cham di, khong sap', () => {
  test('Redis tu choi ket noi: moi request van thanh cong tu CSDL, cau dao mo', async () => {
    const shop = shopWith();
    redis.down = true;
    for (let i = 0; i < 10; i++) {
      assert.equal((await shop.products.findOne('P001')).id, 'P001');
      await shop.carts.view('u1');
      await shop.reports.topSellers('ao');
    }
    assert.equal(shop.client.state, 'open');
    assert.equal(shop.metrics.snapshot().product.bypass, 10);
  });

  test('Redis treo: moi lenh bi cat sau 50ms, sau 5 lan loi thi khong goi Redis nua', async () => {
    const shop = shopWith({ timeoutMs: 50, failureThreshold: 5 });
    redis.hang = true;
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) await shop.catalog.categories();
    const slowPhase = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < 20; i++) await shop.catalog.categories();
    const fastPhase = performance.now() - t1;
    assert.equal(shop.client.state, 'open');
    assert.ok(slowPhase < 5 * 2 * 50 + 200, `slowPhase=${slowPhase}`);
    // khi cau dao mo, moi request khong con phai cho 50ms timeout cua Redis
    assert.ok(fastPhase / 20 < 50 / 2, `trung binh ${(fastPhase / 20).toFixed(1)}ms/request`);
  });

  test('Redis hoi phuc -> cau dao thu lai va bo nho dem hoat dong tro lai', async () => {
    const shop = shopWith({ failureThreshold: 2, openMs: 100 });
    redis.down = true;
    await shop.products.findOne('P001');
    await shop.products.findOne('P001');
    assert.equal(shop.client.state, 'open');
    redis.down = false;
    await sleep(120);
    await shop.products.findOne('P001');
    await shop.products.findOne('P001');
    assert.equal(shop.client.state, 'closed');
    assert.equal(shop.metrics.snapshot().product.hits, 1);
  });

  test('doi gia trong luc Redis sap -> khi Redis song lai khong tra gia cu con sot trong Redis', async () => {
    const shop = shopWith({ failureThreshold: 1, openMs: 50 });
    await shop.products.findOne('P001'); // gia cu nam trong Redis
    redis.down = true;
    await shop.products.updatePrice('P001', 77_000); // khong xoa duoc khoa
    assert.equal(shop.cache.pendingInvalidationCount, 1);
    redis.down = false;
    await sleep(60);
    assert.equal((await shop.products.findOne('P001')).price, 77_000);
    assert.equal(shop.cache.pendingInvalidationCount, 0);
    assert.equal((await shop.products.findOne('P001')).price, 77_000);
  });
});

describe('HTTP', () => {
  let app: INestApplication;
  afterEach(() => app?.close());

  test('API + bao cao ti le trung theo loai du lieu', async () => {
    ({ app } = await createApp({ redis, db: new FakeDb(FAST), logger: false }));
    await app.listen(0);
    const url = `http://localhost:${app.getHttpServer().address().port}`;
    const user = { 'x-user-id': 'u1', 'content-type': 'application/json' };

    await fetch(`${url}/products/P001`);
    await fetch(`${url}/products/P001`);
    assert.equal((await fetch(`${url}/cart`)).status, 400, 'thieu x-user-id');
    const add = await fetch(`${url}/cart/items`, { method: 'POST', headers: user, body: JSON.stringify({ productId: 'P001', qty: 1 }) });
    assert.equal(add.status, 201);
    assert.equal((await fetch(`${url}/reports/top-sellers?category=khong-co`)).status, 400);
    assert.equal((await fetch(`${url}/products/KHONG-CO`)).status, 404);

    const stats = (await (await fetch(`${url}/cache/stats`)).json()) as {
      redis: string;
      byKind: Record<string, { hits: number; hitRatio: number }>;
    };
    assert.equal(stats.redis, 'closed');
    assert.ok(stats.byKind.product.hits >= 1);
    assert.ok(stats.byKind.product.hitRatio > 0);
  });
});

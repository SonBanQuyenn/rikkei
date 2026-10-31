import { afterEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { createApp } from '../src/app.js';
import { CatalogCache, CATALOG_TTL_SEC } from '../src/catalog/catalog-cache.js';
import { CatalogRepository, type Product } from '../src/catalog/catalog.repository.js';
import type { CatalogResponse } from '../src/catalog/catalog.service.js';

const DB_LATENCY_MS = 300;
let app: INestApplication | undefined;
let redis: Redis;

async function start(maxKeys?: number) {
  redis = new RedisMock() as unknown as Redis;
  await redis.flushall();
  app = await createApp({ redis, dbLatencyMs: DB_LATENCY_MS, maxKeys, logger: false });
  await app.listen(0);
  const { port } = app.getHttpServer().address();
  const url = `http://localhost:${port}`;
  const repo = app.get(CatalogRepository);
  const cache = app.get(CatalogCache);

  const get = async (qs: string) => {
    const started = performance.now();
    const res = await fetch(`${url}/catalog?${qs}`);
    return { status: res.status, body: (await res.json()) as CatalogResponse, ms: performance.now() - started };
  };
  const patch = (path: string, body: object) =>
    fetch(`${url}${path}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { repo, cache, get, patch };
}

afterEach(async () => {
  await app?.close();
  app = undefined;
  redis.disconnect();
});

describe('Luu dem ket qua loc', () => {
  test('lan dau di CSDL (~800ms that, 300ms o test), lan sau tra ve duoi 20ms', async () => {
    const api = await start();
    const first = await api.get('category=ao&sort=price_asc&page=1');
    const second = await api.get('category=ao&sort=price_asc&page=1');
    assert.equal(first.body.cache, 'MISS');
    assert.ok(first.ms >= DB_LATENCY_MS);
    assert.equal(second.body.cache, 'HIT');
    assert.ok(second.ms < 20, `hit mat ${second.ms.toFixed(1)}ms`);
    assert.deepEqual(second.body.items, first.body.items);
    assert.equal(api.repo.queries, 1);
  });

  test('chi dem 3 trang dau; trang 4 tro di luon doc thang CSDL', async () => {
    const api = await start();
    for (const page of [1, 2, 3]) {
      await api.get(`category=giay&page=${page}`);
      assert.equal((await api.get(`category=giay&page=${page}`)).body.cache, 'HIT');
    }
    const p4a = await api.get('category=giay&page=4');
    const p4b = await api.get('category=giay&page=4');
    assert.equal(p4a.body.cache, 'BYPASS');
    assert.equal(p4b.body.cache, 'BYPASS');
    assert.equal(api.repo.queries, 5);
    assert.equal(await api.cache.keyCount(), 3);
  });

  test('moi ket qua song toi da 60s (ton kho tre toi da 60s)', async () => {
    const api = await start();
    await api.get('category=quan');
    const [key] = await redis.keys('catalog:quan:*');
    const ttl = await redis.ttl(key);
    assert.ok(ttl > 0 && ttl <= CATALOG_TTL_SEC, `ttl=${ttl}`);
  });
});

describe('Vo hieu hoa khi du lieu nguon thay doi', () => {
  test('doi gia -> moi ket qua loc chua san pham do thay gia moi ngay lap tuc', async () => {
    const api = await start();
    const before = await api.get('category=ao&sort=price_asc');
    const target = before.body.items[0];

    assert.equal((await api.patch(`/products/${target.id}/price`, { price: target.price + 1_000 })).status, 200);

    const after = await api.get('category=ao&sort=price_asc');
    assert.equal(after.body.cache, 'MISS');
    assert.equal(after.body.items.find((p) => p.id === target.id)?.price, target.price + 1_000);

    // ket qua khong loc danh muc cung chua san pham do -> cung phai lam moi
    const all = await api.get(`brand=${target.brand}&sort=price_asc`);
    assert.equal(all.body.items.find((p) => p.id === target.id)?.price, target.price + 1_000);
  });

  test('doi gia lam san pham lot VAO khoang gia dang duoc dem -> xuat hien ngay', async () => {
    const api = await start();
    const qs = 'category=tui&maxPrice=100000&sort=price_asc';
    const before = await api.get(qs);
    const outside = [...api.repo.products.values()].find((p: Product) => p.category === 'tui' && p.price >= 100_000)!;
    assert.ok(!before.body.items.some((p) => p.id === outside.id));

    await api.patch(`/products/${outside.id}/price`, { price: 10_000 });
    const after = await api.get(qs);
    assert.equal(after.body.items[0].id, outside.id);
    assert.equal(after.body.items[0].price, 10_000);
  });

  test('doi gia o danh muc khac khong lam mat ban dem cua danh muc nay', async () => {
    const api = await start();
    await api.get('category=ao');
    const other = [...api.repo.products.values()].find((p: Product) => p.category === 'giay')!;
    await api.patch(`/products/${other.id}/price`, { price: 123_000 });
    assert.equal((await api.get('category=ao')).body.cache, 'HIT');
  });

  test('doi ton kho -> ket qua duoc lam moi khi het TTL (tre <= 60s), khong xoa ngay', async () => {
    const api = await start();
    const before = await api.get('category=quan');
    const target = before.body.items[0];
    await api.patch(`/products/${target.id}/stock`, { stock: 0 });

    const within = await api.get('category=quan');
    assert.equal(within.body.cache, 'HIT', 'trong 60s duoc phep tra ton kho cu');

    // mo phong het TTL 60s
    for (const key of await redis.keys('catalog:quan:*')) await redis.del(key);
    const expired = await api.get('category=quan');
    assert.equal(expired.body.items.find((p) => p.id === target.id)?.stock, 0);
  });
});

describe('Bay du lieu', () => {
  test('cung noi dung, khac thu tu tham so / hoa thuong / thu tu brand -> cung mot ban ghi dem', async () => {
    const api = await start();
    const variants = [
      'category=ao&brand=nike,adidas&minPrice=100000&maxPrice=500000&sort=price_asc&page=1',
      'page=1&sort=price_asc&maxPrice=500000&minPrice=100000&brand=adidas,nike&category=ao',
      'category=AO&brand=Adidas&brand=NIKE&minPrice=100000&maxPrice=500000&sort=PRICE_ASC',
      'category=ao&brand=nike,adidas,nike&minPrice=100000&maxPrice=500000&sort=price_asc&utm_source=fb',
    ];
    const results = [];
    for (const qs of variants) results.push(await api.get(qs));
    assert.deepEqual(results.map((r) => r.status), [200, 200, 200, 200]);
    assert.deepEqual(results.map((r) => r.body.cache), ['MISS', 'HIT', 'HIT', 'HIT']);
    assert.equal(api.repo.queries, 1);
    assert.equal(await api.cache.keyCount(), 1);
  });

  test('hang nghin to hop vo nghia -> 400, khong sinh them khoa nao, khong cham CSDL', async () => {
    const api = await start();
    const junk = [
      ...Array.from({ length: 300 }, (_, i) => `category=xyz${i}`),
      ...Array.from({ length: 300 }, (_, i) => `minPrice=${100_001 + i}`),
      ...Array.from({ length: 200 }, (_, i) => `brand=fake${i}`),
      ...Array.from({ length: 100 }, (_, i) => `sort=random${i}`),
      ...Array.from({ length: 100 }, (_, i) => `page=-${i}`),
      'brand=nike,adidas,puma,zara',
      'minPrice=500000&maxPrice=100000',
      'category=ao&category=quan',
    ];
    const statuses: number[] = [];
    for (let i = 0; i < junk.length; i += 50) {
      statuses.push(...(await Promise.all(junk.slice(i, i + 50).map(async (qs) => (await api.get(qs)).status))));
    }
    assert.equal(statuses.length, junk.length);
    assert.ok(statuses.every((s) => s === 400));
    assert.equal(await api.cache.keyCount(), 0);
    assert.equal(api.repo.queries, 0);
  });

  test('tham so la (utm, fbclid...) khong tao khoa moi', async () => {
    const api = await start();
    await Promise.all(Array.from({ length: 50 }, (_, i) => api.get(`category=ao&fbclid=${i}`)));
    assert.equal(await api.cache.keyCount(), 1);
  });

  test('tran tong so khoa: vuot gioi han thi van tra ket qua nhung khong ghi dem them', async () => {
    const api = await start(3);
    for (const category of ['ao', 'quan', 'giay', 'tui']) await api.get(`category=${category}`);
    assert.equal(await api.cache.keyCount(), 3);
    const fourth = await api.get('category=tui');
    assert.equal(fourth.status, 200);
    assert.equal(fourth.body.cache, 'MISS_NOT_STORED');
    assert.equal((await api.get('category=ao')).body.cache, 'HIT');
  });
});

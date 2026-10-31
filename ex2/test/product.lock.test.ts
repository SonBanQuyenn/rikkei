import { after, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import RedisMock from 'ioredis-mock';
import type { Redis } from 'ioredis';
import { ProductRepository } from '../src/product.repository.js';
import { OriginalProductService } from '../src/product.service.original.js';
import {
  CACHE_TTL_JITTER_SEC,
  CACHE_TTL_SEC,
  LOCK_TTL_MS,
  ProductService,
  WAIT_MAX_RETRIES,
  WAIT_RETRY_DELAY_MS,
  lockKeyOf,
  productKey,
} from '../src/product.service.js';

const redis = new RedisMock() as unknown as Redis;
const ID = 'FS-001';
const KEY = productKey(ID);
const LOCK = lockKeyOf(KEY);

beforeEach(() => redis.flushall());
after(() => redis.disconnect());

const burst = (svc: { getProductWithLock(id: string): Promise<unknown> }, n: number) =>
  Promise.allSettled(Array.from({ length: n }, () => svc.getProductWithLock(ID)));

describe('Chong don dap khi khoa het han', () => {
  test('ham goc: 200 request cung luc -> 200 truy van DB', async () => {
    const repo = new ProductRepository(50);
    await burst(new OriginalProductService(redis, repo), 200);
    assert.equal(repo.queries, 200);
  });

  test('co khoa: 200 request cung luc -> 1 truy van DB, tat ca nhan du lieu', async () => {
    const repo = new ProductRepository(50);
    const results = await burst(new ProductService(redis, repo), 200);
    assert.equal(repo.queries, 1);
    assert.ok(results.every((r) => r.status === 'fulfilled'));
  });

  test('nhieu instance (nhieu ket noi Redis) van chi 1 truy van DB', async () => {
    const repo = new ProductRepository(50);
    const services = Array.from({ length: 4 }, () => new ProductService(new RedisMock() as unknown as Redis, repo));
    await Promise.all(services.map((s) => burst(s, 50)));
    assert.equal(repo.queries, 1);
  });
});

describe('Khoa phan tan va TTL', () => {
  test('khoa co thoi gian song, tu het han neu tien trinh giu khoa chet', async () => {
    const repo = new ProductRepository(100);
    const pending = new ProductService(redis, repo).getProductWithLock(ID);
    await new Promise((r) => setTimeout(r, 20));
    const pttl = await redis.pttl(LOCK);
    assert.ok(pttl > 0 && pttl <= LOCK_TTL_MS, `pttl=${pttl}`);
    await pending;
    assert.equal(await redis.exists(LOCK), 0, 'dung xong phai giai phong khoa');
  });

  test('TTL ban ghi dem co do lech ngau nhien trong [300, 360] giay', async () => {
    const ttls = new Set<number>();
    for (let i = 0; i < 20; i++) {
      await redis.del(KEY);
      await new ProductService(redis, new ProductRepository(0)).getProductWithLock(ID);
      const ttl = await redis.ttl(KEY);
      assert.ok(ttl >= CACHE_TTL_SEC && ttl <= CACHE_TTL_SEC + CACHE_TTL_JITTER_SEC, `ttl=${ttl}`);
      ttls.add(ttl);
    }
    assert.ok(ttls.size > 1, 'TTL phai khac nhau giua cac lan dung');
  });

  test('chi xoa khoa cua minh: khoa cua request khac khong bi xoa nham', async () => {
    await redis.set(LOCK, 'token-cua-request-khac', 'PX', LOCK_TTL_MS);
    await redis.set(KEY, JSON.stringify({ id: ID }));
    // request nay doc duoc cache nen khong dung khoa; giai phong voi token sai cung khong xoa
    const svc = new ProductService(redis, new ProductRepository(0));
    await svc.getProductWithLock(ID);
    assert.equal(await redis.get(LOCK), 'token-cua-request-khac');
  });
});

describe('Bay du lieu', () => {
  test('DB nem loi giua chung -> khoa van duoc giai phong, request sau dung lai binh thuong', async () => {
    const repo = new ProductRepository(30);
    repo.failNext = 1;
    const svc = new ProductService(redis, repo);

    await assert.rejects(svc.getProductWithLock(ID), /DB connection reset/);
    assert.equal(await redis.exists(LOCK), 0, 'khoa phai duoc giai phong ngay, khong doi 5s');

    const product = await svc.getProductWithLock(ID);
    assert.equal(product.id, ID);
  });

  test('DB loi trong luc nhieu request dang cho -> 1 request loi, cac request cho tu dung lai (van 1 truy van mot luc)', async () => {
    const repo = new ProductRepository(30);
    repo.failNext = 1;
    const results = await burst(new ProductService(redis, repo), 50);
    const failed = results.filter((r) => r.status === 'rejected').length;
    assert.equal(failed, 1);
    assert.equal(repo.queries, 2);
  });

  test('khoa bi giu ma cache khong bao gio duoc dung -> request cho bo cuoc sau so lan gioi han', async () => {
    // tien trinh khac giu khoa (vd. dang treo), khoa con song lau hon thoi gian cho
    await redis.set(LOCK, 'tien-trinh-treo', 'PX', 60_000);
    const repo = new ProductRepository(0);
    const started = Date.now();
    await assert.rejects(new ProductService(redis, repo).getProductWithLock(ID), /dang duoc tai/);
    const waited = Date.now() - started;
    const budget = WAIT_MAX_RETRIES * WAIT_RETRY_DELAY_MS;
    assert.ok(waited >= budget && waited < budget + 1_000, `waited=${waited}`);
    assert.equal(repo.queries, 0, 'khong duoc xuong DB khi khong giu khoa');
  });
});

import { afterEach, describe, mock, test } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app.js';
import { ProductRepository } from '../src/product.repository.js';
import { ProductService } from '../src/product.service.js';
import { BuggyProductService } from '../src/product.service.buggy.js';

type Product = { id: string; name: string; price: number };
const ONE_DAY = 24 * 60 * 60 * 1000;

let app: INestApplication | undefined;

async function start(service: typeof ProductService | typeof BuggyProductService) {
  app = await createApp(service, false);
  await app.listen(0);
  const { port } = app.getHttpServer().address();
  const url = `http://localhost:${port}`;
  return {
    repo: app.get(ProductRepository),
    get: async (id: string) => (await fetch(`${url}/products/${id}`)).json() as Promise<Product>,
    patch: async (id: string, body: object) =>
      (await fetch(`${url}/products/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })).json() as Promise<Product>,
  };
}

afterEach(async () => {
  mock.timers.reset();
  await app?.close();
  app = undefined;
});

/** K1: GET /products/A roi GET /products/B. Dung: B tra ve thong tin cua B. */
async function scenarioMixedProducts(service: typeof ProductService | typeof BuggyProductService) {
  const api = await start(service);
  await api.get('A');
  return api.get('B');
}

/** K2: PATCH /products/A {price:120000} roi GET /products/A. Dung: thay gia 120000 ngay. */
async function scenarioUpdate(service: typeof ProductService | typeof BuggyProductService) {
  const api = await start(service);
  await api.get('A');
  await api.patch('A', { price: 120_000 });
  return api.get('A');
}

/**
 * K3: job ket thuc khuyen mai ghi thang CSDL (khong qua service.update): A 150000 -> 200000.
 * Mot ngay sau GET /products/A. Dung: thay gia goc 200000.
 */
async function scenarioPromotionEnded(service: typeof ProductService | typeof BuggyProductService) {
  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const api = await start(service);
  await api.get('A');
  await api.repo.update('A', { price: 200_000 });
  mock.timers.tick(ONE_DAY);
  return api.get('A');
}

describe('Ban LOI - chung minh khiem khuyet', () => {
  test('K1: mo san pham B nhung nhan thong tin san pham A (khoa dem dung chung)', async () => {
    const b = await scenarioMixedProducts(BuggyProductService);
    assert.deepEqual(b, { id: 'A', name: 'Ao thun ShopFast', price: 150_000 });
  });

  test('K2: doi gia xong van thay gia cu (update khong vo hieu hoa bo nho dem)', async () => {
    const a = await scenarioUpdate(BuggyProductService);
    assert.equal(a.price, 150_000);
  });

  test('K3: khuyen mai het tu hom qua van ban gia khuyen mai (ban ghi dem song vinh vien)', async () => {
    const a = await scenarioPromotionEnded(BuggyProductService);
    assert.equal(a.price, 150_000);
  });
});

describe('Ban SUA - cung kich ban, ket qua dung', () => {
  test('K1: moi san pham mot khoa rieng', async () => {
    const b = await scenarioMixedProducts(ProductService);
    assert.deepEqual(b, { id: 'B', name: 'Quan jean ShopFast', price: 400_000 });
  });

  test('K2: doi gia xong thay gia moi ngay lap tuc', async () => {
    const a = await scenarioUpdate(ProductService);
    assert.equal(a.price, 120_000);
  });

  test('K3: ban ghi dem het han sau TTL, doc lai gia moi tu CSDL', async () => {
    const a = await scenarioPromotionEnded(ProductService);
    assert.equal(a.price, 200_000);
  });

  test('van dung bo nho dem: doc lai lan 2 khong xuong CSDL', async () => {
    const api = await start(ProductService);
    await api.get('A');
    await api.get('A');
    assert.equal(api.repo.queries, 1);
  });

  test('san pham khong ton tai tra 404', async () => {
    const api = await start(ProductService);
    const res = await api.get('Z');
    assert.equal((res as unknown as { statusCode: number }).statusCode, 404);
  });
});

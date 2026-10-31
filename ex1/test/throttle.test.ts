import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication, Type } from '@nestjs/common';
import { createApp } from '../src/app.js';
import { BuggyAppModule } from '../src/buggy/app.module.js';
import { AppModule } from '../src/fixed/app.module.js';

async function start(module: Type<unknown>) {
  const app = await createApp(module, false);
  await app.listen(0);
  const { port } = app.getHttpServer().address();
  return { app, url: `http://localhost:${port}` };
}

/** Goi endpoint `times` lan voi cung mot tai khoan, tra ve danh sach status code. */
async function hit(url: string, path: string, body: object, times: number, userId = 'acc-1') {
  const statuses: number[] = [];
  for (let i = 0; i < times; i++) {
    const res = await fetch(url + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': userId },
      body: JSON.stringify(body),
    });
    statuses.push(res.status);
  }
  return statuses;
}

const order = { productId: 'P-1', quantity: 1 };
const otp = { phone: '0900000001' };
const count = (arr: number[], code: number) => arr.filter((s) => s === code).length;

describe('Ban LOI - chung minh khiem khuyet', () => {
  let app: INestApplication;
  let url: string;
  before(async () => ({ app, url } = await start(BuggyAppModule)));
  after(() => app.close());

  test('K1: guard chua kich hoat - 1 tai khoan dat 10 don flash sale lien tiep deu thanh cong', async () => {
    const statuses = await hit(url, '/orders/flash-sale', order, 10);
    // Thuc te: 10 x 201. Dung phai la: 3 x 201 + 7 x 429
    assert.equal(count(statuses, 201), 10);
    assert.equal(count(statuses, 429), 0);
  });

  test('K2: @SkipThrottle tren send-otp - 10 tin OTP lien tiep deu duoc gui', async () => {
    const statuses = await hit(url, '/auth/send-otp', otp, 10);
    // Thuc te: 10 x 201. Dung phai la: 3 x 201 + 7 x 429
    assert.equal(count(statuses, 201), 10);
    assert.equal(count(statuses, 429), 0);
  });
});

describe('Ban DA SUA', () => {
  let app: INestApplication;
  let url: string;
  before(async () => ({ app, url } = await start(AppModule)));
  after(() => app.close());

  test('K1: tai khoan chi dat duoc 3 don flash sale / 60s, lan thu 4 tro di bi 429', async () => {
    const statuses = await hit(url, '/orders/flash-sale', order, 10, 'buyer-A');
    assert.deepEqual(statuses.slice(0, 3), [201, 201, 201]);
    assert.equal(count(statuses, 429), 7);
  });

  test('K2: send-otp chi goi duoc 3 lan / 5 phut', async () => {
    const statuses = await hit(url, '/auth/send-otp', otp, 10, 'buyer-A');
    assert.deepEqual(statuses.slice(0, 3), [201, 201, 201]);
    assert.equal(count(statuses, 429), 7);
  });

  test('han muc dem theo tai khoan: tai khoan khac cung IP khong bi anh huong', async () => {
    const statuses = await hit(url, '/orders/flash-sale', order, 3, 'buyer-B');
    assert.deepEqual(statuses, [201, 201, 201]);
  });

  test('phan hoi 429 co Retry-After de client biet khi nao thu lai', async () => {
    const res = await fetch(url + '/orders/flash-sale', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-id': 'buyer-A' },
      body: JSON.stringify(order),
    });
    assert.equal(res.status, 429);
    assert.ok(Number(res.headers.get('retry-after')) > 0);
  });
});

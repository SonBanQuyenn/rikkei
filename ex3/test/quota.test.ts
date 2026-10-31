import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app.js';
import { Clock } from '../src/quota/clock.js';
import { CounterStore } from '../src/quota/counter.store.js';
import { MerchantStore } from '../src/quota/merchant.store.js';
import { DAY, MINUTE } from '../src/quota/plans.js';
import { QuotaService } from '../src/quota/quota.service.js';

describe('QuotaService - nhieu tang han muc cung luc', () => {
  // Moc 01:00 gio VN de khong cham bien ngay
  const start = Date.UTC(2026, 10, 11, 18, 0, 0);

  test('Free: 60 / phut - request thu 61 trong cung phut bi chan boi han muc phut', () => {
    const quota = new QuotaService(new CounterStore());
    for (let i = 0; i < 60; i++) assert.equal(quota.consume('m1', 'free', false, start).allowed, true);
    const d = quota.consume('m1', 'free', false, start);
    assert.equal(d.allowed, false);
    assert.equal(d.violated?.name, 'minute');
  });

  test('Free: 5.000 / ngay - het han muc ngay thi sang phut moi van bi chan', () => {
    const quota = new QuotaService(new CounterStore());
    let now = start;
    for (let i = 0; i < 5000; i++) {
      if (i > 0 && i % 60 === 0) now += MINUTE;
      assert.equal(quota.consume('m1', 'free', false, now).allowed, true);
    }
    const d = quota.consume('m1', 'free', false, now + MINUTE);
    assert.equal(d.allowed, false);
    assert.equal(d.violated?.name, 'day');
    assert.equal(d.rules.find((r) => r.name === 'minute')?.remaining, 60); // phut moi con nguyen
    // Sang ngay moi (00:00 gio VN) thi duoc goi lai
    assert.equal(quota.consume('m1', 'free', false, start + DAY).allowed, true);
  });

  test('request bi chan khong lam hao han muc ngay', () => {
    const quota = new QuotaService(new CounterStore());
    for (let i = 0; i < 100; i++) quota.consume('m1', 'free', false, start);
    const d = quota.consume('m1', 'free', false, start + MINUTE);
    assert.equal(d.rules.find((r) => r.name === 'day')?.remaining, 5000 - 61);
  });

  test('Enterprise: khong gioi han ngay, nhung van 6.000 / phut', () => {
    const quota = new QuotaService(new CounterStore());
    for (let i = 0; i < 6000; i++) quota.consume('m1', 'enterprise', false, start);
    const d = quota.consume('m1', 'enterprise', false, start);
    assert.equal(d.allowed, false);
    assert.equal(d.violated?.name, 'minute');
    assert.deepEqual(d.rules.find((r) => r.name === 'day'), { name: 'day', limit: null, remaining: null, resetAt: null });
  });

  test('bao cao ton tai nguyen: Enterprise cung chi 10 / gio', () => {
    const quota = new QuotaService(new CounterStore());
    for (let i = 0; i < 10; i++) assert.equal(quota.consume('m1', 'enterprise', true, start + i * MINUTE).allowed, true);
    const d = quota.consume('m1', 'enterprise', true, start + 10 * MINUTE);
    assert.equal(d.violated?.name, 'report-hour');
    assert.equal(d.retryAfterMs, 50 * MINUTE);
  });
});

describe('HTTP - tieu de phan hoi va bay du lieu', () => {
  let app: INestApplication;
  let url: string;

  before(async () => {
    app = await createApp(false);
    await app.listen(0);
    url = `http://localhost:${app.getHttpServer().address().port}`;
  });
  after(() => app.close());
  // Moi test bat dau o mot phut moi de bo dem phut khong anh huong nhau
  beforeEach(() => app.get(Clock).advance(MINUTE));

  const get = (path: string, key?: string) => fetch(url + path, { headers: key ? { 'x-api-key': key } : {} });
  const admin = (path: string, method: string, body?: object) =>
    fetch(url + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-admin-token': 'admin-secret' },
      body: body && JSON.stringify(body),
    });

  test('moi phan hoi deu cho biet goi va han muc con lai', async () => {
    const res = await get('/api/products', 'key-pro-001');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-ratelimit-plan'), 'pro');
    assert.equal(res.headers.get('x-ratelimit-limit-minute'), '600');
    assert.equal(res.headers.get('x-ratelimit-remaining-minute'), '599');
    assert.equal(res.headers.get('x-ratelimit-limit-day'), '200000');
    assert.ok(Number(res.headers.get('x-ratelimit-reset-minute')) <= 60);

    const ent = await get('/api/products', 'key-ent-001');
    assert.equal(ent.headers.get('x-ratelimit-limit-day'), 'unlimited');
  });

  test('vuot han muc -> 429 + Retry-After + thong bao ro rang', async () => {
    for (let i = 0; i < 60; i++) await get('/api/products', 'key-free-001');
    const res = await get('/api/products', 'key-free-001');
    assert.equal(res.status, 429);
    assert.equal(res.headers.get('x-ratelimit-remaining-minute'), '0');
    assert.ok(Number(res.headers.get('retry-after')) > 0);
    const body = await res.json();
    assert.equal(body.limit, 'minute');
    assert.match(body.message, /hạn mức theo phút của gói FREE \(60 request\)/);
  });

  test('BAY: nang goi giua chung -> han muc moi co hieu luc ngay, khong cho het chu ky', async () => {
    app.get(MerchantStore).addMerchant('m-up', 'Shop Nang Cap', 'free', 'key-up-001');
    for (let i = 0; i < 60; i++) await get('/api/products', 'key-up-001');
    assert.equal((await get('/api/products', 'key-up-001')).status, 429);

    assert.equal((await admin('/admin/merchants/m-up/plan', 'PATCH', { plan: 'pro' })).status, 200);

    // Cung phut do, request ke tiep da duoc tinh theo goi Pro (60 da dung / 600)
    const res = await get('/api/products', 'key-up-001');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-ratelimit-plan'), 'pro');
    assert.equal(res.headers.get('x-ratelimit-remaining-minute'), String(600 - 61));
  });

  test('BAY: khong co khoa -> chi duoc han muc Free theo IP, kem thong bao', async () => {
    const res = await get('/api/products');
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-ratelimit-plan'), 'free');
    assert.equal(res.headers.get('x-ratelimit-limit-minute'), '60');
    assert.match(res.headers.get('x-ratelimit-notice') ?? '', /Missing X-API-Key/);
  });

  test('BAY: khoa da thu hoi -> mat quyen huong goi Enterprise, roi ve han muc thap nhat', async () => {
    app.get(MerchantStore).addMerchant('m-rv', 'Shop Bi Thu Hoi', 'enterprise', 'key-rv-001');
    assert.equal((await get('/api/products', 'key-rv-001')).headers.get('x-ratelimit-plan'), 'enterprise');

    await admin('/admin/keys/key-rv-001/revoke', 'POST');

    const res = await get('/api/products', 'key-rv-001');
    assert.equal(res.headers.get('x-ratelimit-plan'), 'free');
    assert.match(res.headers.get('x-ratelimit-notice') ?? '', /Revoked/);

    // Dung khoa da thu hoi spam: chi duoc 60 / phut nhu Free, khong phai 6.000
    let blocked: Response | undefined;
    for (let i = 0; i < 70 && !blocked; i++) {
      const r = await get('/api/products', 'key-rv-001');
      if (r.status === 429) blocked = r;
    }
    assert.ok(blocked, 'khoa thu hoi phai bi chan o han muc Free');
    const body = await blocked.json();
    assert.match(body.message, /Khoá API đã bị thu hồi/);
  });

  test('khoa khong ton tai cung bi tinh nhu khong co khoa', async () => {
    const res = await get('/api/products', 'key-gia-mao');
    assert.equal(res.headers.get('x-ratelimit-plan'), 'free');
    assert.match(res.headers.get('x-ratelimit-notice') ?? '', /Invalid X-API-Key/);
  });

  test('endpoint bao cao: moi goi chi 10 / gio, co tieu de rieng', async () => {
    for (let i = 0; i < 10; i++) {
      const r = await get('/api/reports/inventory', 'key-ent-001');
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('x-ratelimit-remaining-report-hour'), String(9 - i));
    }
    const res = await get('/api/reports/inventory', 'key-ent-001');
    assert.equal(res.status, 429);
    assert.equal((await res.json()).limit, 'report-hour');
    // Endpoint thuong van dung binh thuong
    assert.equal((await get('/api/products', 'key-ent-001')).status, 200);
  });
});

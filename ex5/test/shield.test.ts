import { after, before, beforeEach, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { INestApplication } from '@nestjs/common';
import { createApp } from '../src/app.js';
import { Clock } from '../src/shield/clock.js';
import { PolicyConfigStore } from '../src/shield/config/policy-config.store.js';
import { ShieldStore } from '../src/shield/storage/shield-store.js';

const PRODUCT = 'FS-IPHONE';
let app: INestApplication;
let url: string;
let seq = 0;

before(async () => {
  app = await createApp(false);
  await app.listen(0);
  url = `http://localhost:${app.getHttpServer().address().port}`;
});
after(() => app.close());
beforeEach(() => {
  app.get(PolicyConfigStore).reset();
  // Moi test o mot "khung gio" moi de bo dem cua test truoc het han
  app.get(Clock).advance(2 * 60 * 60_000);
});

/** Moi test dung thiet bi / IP rieng. */
function client(opts: { device?: string; ip?: string } = {}) {
  const id = ++seq;
  const device = opts.device ?? `dev-${id}`;
  const ip = opts.ip ?? `10.0.${Math.floor(id / 250)}.${id % 250}`;
  const headers = (extra: Record<string, string | undefined> = {}) =>
    Object.fromEntries(Object.entries({ 'content-type': 'application/json', 'x-device-id': device, 'x-forwarded-for': ip, ...extra }).filter(([, v]) => v !== undefined)) as Record<string, string>;
  return {
    device,
    view: () => fetch(`${url}/flash-sale/products/${PRODUCT}`, { headers: headers() }),
    order: (user: string | undefined, body: object, extra: Record<string, string> = {}) =>
      fetch(`${url}/flash-sale/products/${PRODUCT}/orders`, { method: 'POST', headers: headers({ 'x-user-id': user, ...extra }), body: JSON.stringify(body) }),
    solve: (id: string, answer: unknown) =>
      fetch(`${url}/shield/challenges/${id}/solve`, { method: 'POST', headers: headers(), body: JSON.stringify({ answer }) }),
  };
}

const admin = (path: string, init: RequestInit = {}) =>
  fetch(url + path, { ...init, headers: { 'content-type': 'application/json', 'x-admin-token': 'admin-secret', ...(init.headers ?? {}) } });

const answerOf = (question: string) => String(question.match(/\d+/g)!.map(Number).reduce((a, b) => a + b));

/** Luong khach that: mo trang, doc 2 giay, dat 1 san pham. */
async function realCustomerBuys(c: ReturnType<typeof client>, user: string) {
  const { viewToken } = await (await c.view()).json();
  app.get(Clock).advance(2_000);
  return c.order(user, { viewToken, quantity: 1 });
}

describe('Khach that', () => {
  test('mo trang -> doc -> dat hang: khong bi chan', async () => {
    const res = await realCustomerBuys(client(), 'real-1');
    assert.equal(res.status, 201);
  });
});

describe('Lop 1 - Toc do', () => {
  test('thiet bi gui qua 20 request / 10s -> 429 kem thu thach, ghi log du thong tin', async () => {
    const bot = client();
    const statuses: number[] = [];
    let blocked: any;
    for (let i = 0; i < 25; i++) {
      const res = await bot.view();
      statuses.push(res.status);
      if (res.status === 429 && !blocked) blocked = await res.json();
    }
    assert.equal(statuses.filter((s) => s === 200).length, 20);
    assert.equal(blocked.code, 'CHALLENGE_REQUIRED');
    assert.equal(blocked.layer, 'velocity');
    assert.ok(blocked.challenge.id && blocked.challenge.question);

    const [log] = await (await admin(`/admin/shield/logs?deviceId=${bot.device}&limit=1`)).json();
    for (const field of ['id', 'at', 'requestId', 'layer', 'rule', 'observed', 'threshold', 'path', 'ip', 'deviceId', 'challengeId']) {
      assert.ok(log[field] !== undefined, `log thieu truong ${field}`);
    }
    assert.equal(log.rule, 'device-rate');
    assert.equal(log.threshold, 20);
  });

  test('bot doi ma thiet bi lien tuc van bi chan theo IP', async () => {
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await client({ ip: '172.16.0.99' }).view()).status;
    assert.equal(last, 429);
  });
});

describe('Lop 2 - Hanh vi', () => {
  test('goi thang API dat hang khong qua trang san pham -> 403 thu thach', async () => {
    const res = await client().order('bot-direct', { quantity: 1 });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.layer, 'behavior');
    assert.equal(body.rule, 'missing-view');
  });

  test('dat hang 100ms sau khi mo trang -> 403 thu thach', async () => {
    const bot = client();
    const { viewToken } = await (await bot.view()).json();
    app.get(Clock).advance(100);
    const body = await (await bot.order('bot-fast', { viewToken })).json();
    assert.equal(body.rule, 'too-fast');
  });

  test('dung lai view token cua thiet bi khac -> 403', async () => {
    const { viewToken } = await (await client().view()).json();
    app.get(Clock).advance(2_000);
    const body = await (await client().order('bot-steal', { viewToken })).json();
    assert.equal(body.rule, 'missing-view');
  });
});

describe('Lop 3 - Nick ao', () => {
  test('tai khoan thu 4 dat hang tren cung thiet bi trong 1 gio -> 403 thu thach', async () => {
    const farm = client();
    for (const user of ['farm-1', 'farm-2', 'farm-3']) assert.equal((await realCustomerBuys(farm, user)).status, 201);
    const res = await realCustomerBuys(farm, 'farm-4');
    assert.equal(res.status, 403);
    assert.equal((await res.json()).layer, 'account-farm');
  });
});

describe('Do va bao cao chan nham', () => {
  test('khach that bi nghi nham giai thu thach -> dat hang duoc, ti le chan nham duoc tinh', async () => {
    const before = await (await admin('/admin/shield/report')).json();
    // Gia dinh 4 nguoi dung chung may tinh bang
    const tablet = client();
    for (const user of ['mom', 'dad', 'son']) await realCustomerBuys(tablet, user);
    const blocked = await (await realCustomerBuys(tablet, 'daughter')).json();
    assert.equal(blocked.layer, 'account-farm');

    assert.equal((await tablet.solve(blocked.challenge.id, 'sai')).status, 400);
    const solved = await (await tablet.solve(blocked.challenge.id, answerOf(blocked.challenge.question))).json();
    assert.ok(solved.passToken);

    const { viewToken } = await (await tablet.view()).json();
    app.get(Clock).advance(2_000);
    const retry = await tablet.order('daughter', { viewToken, quantity: 1 }, { 'x-challenge-pass': solved.passToken });
    assert.equal(retry.status, 201);

    const report = await (await admin('/admin/shield/report')).json();
    const farm = report.byLayer.find((l: { layer: string }) => l.layer === 'account-farm');
    const farmBefore = before.byLayer.find((l: { layer: string }) => l.layer === 'account-farm');
    assert.equal(farm.falsePositives, farmBefore.falsePositives + 1);
    assert.ok(report.falsePositiveRate > 0);
  });

  test('thu thach khong dung lai duoc va khong dung duoc tu thiet bi khac', async () => {
    const res = await client().order('x', {});
    const { challenge } = await res.json();
    assert.equal((await client().solve(challenge.id, answerOf(challenge.question))).status, 404);
  });

  test('CSKH danh dau chan nham thu cong', async () => {
    await client().order('complainer', {});
    const [log] = await (await admin('/admin/shield/logs?userId=complainer&limit=1')).json();
    const marked = await (await admin(`/admin/shield/logs/${log.id}/false-positive`, { method: 'POST' })).json();
    assert.equal(marked.falsePositive, 'manual');
  });
});

describe('Doi nguong luc dang chay', () => {
  test('nang maxAccountsPerDevice len 5 -> tai khoan thu 4 qua ngay, khong khoi dong lai', async () => {
    const res = await admin('/admin/shield/policies', { method: 'PATCH', body: JSON.stringify({ accountFarm: { maxAccountsPerDevice: 5 } }) });
    assert.equal(res.status, 200);
    const shop = client();
    for (const user of ['a', 'b', 'c', 'd']) assert.equal((await realCustomerBuys(shop, `${shop.device}-${user}`)).status, 201);
  });

  test('tat mot lop -> lop do khong chan nua', async () => {
    await admin('/admin/shield/policies', { method: 'PATCH', body: JSON.stringify({ behavior: { enabled: false } }) });
    assert.equal((await client().order(`u-${seq}`, { quantity: 1 })).status, 201);
  });

  test('cau hinh sai bi tu choi nguyen khoi, cau hinh cu giu nguyen', async () => {
    const res = await admin('/admin/shield/policies', {
      method: 'PATCH',
      body: JSON.stringify({ velocity: { maxPerDevice: 50, maxPerIp: -1 }, unknown: {} }),
    });
    assert.equal(res.status, 400);
    const config = await (await admin('/admin/shield/policies')).json();
    assert.equal(config.velocity.maxPerDevice, 20);
  });

  test('khong co admin token -> 403', async () => {
    assert.equal((await fetch(`${url}/admin/shield/policies`)).status, 403);
  });
});

describe('Ngoai le - khong crash', () => {
  test('kho dem hong -> lop do bo qua (khong chan khach that), dich vu van chay', async () => {
    const store = app.get(ShieldStore);
    const original = store.hit;
    store.hit = () => {
      throw new Error('redis down');
    };
    try {
      assert.equal((await realCustomerBuys(client(), `real-${seq}`)).status, 201);
      const report = await (await admin('/admin/shield/report')).json();
      assert.ok(report.policyErrors >= 1);
    } finally {
      store.hit = original;
    }
  });

  test('du lieu xau tra 4xx ro rang', async () => {
    const c = client();
    const { viewToken } = await (await c.view()).json();
    app.get(Clock).advance(2_000);
    assert.equal((await c.order(undefined, { viewToken })).status, 401);
    assert.equal((await c.order(`q-${seq}`, { viewToken, quantity: 'abc' })).status, 400);
    const broken = await fetch(`${url}/flash-sale/products/${PRODUCT}/orders`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-id': c.device }, body: '{khong phai json' });
    assert.equal(broken.status, 400);
    assert.equal((await fetch(`${url}/flash-sale/products/KHONG-CO`)).status, 404);
  });

  test('vuot gioi han mua 2 san pham / tai khoan -> 409 (quy tac nghiep vu)', async () => {
    const user = `greedy-${seq}`;
    assert.equal((await realCustomerBuys(client(), user)).status, 201);
    const c = client();
    const { viewToken } = await (await c.view()).json();
    app.get(Clock).advance(2_000);
    assert.equal((await c.order(user, { viewToken, quantity: 2 })).status, 409);
  });
});

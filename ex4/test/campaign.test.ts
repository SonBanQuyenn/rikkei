import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { redisConnection } from '../src/config/redis.config.js';
import { CAMPAIGN_QUEUE, TRANSACTIONAL_QUEUE } from '../src/config/email.config.js';
import { FakeProviderServer } from '../src/provider/fake-provider-server.js';
import { HttpEmailProvider } from '../src/provider/email-provider.js';
import { ProviderRateLimiter } from '../src/rate-limit/provider-rate-limiter.js';
import { CampaignStats } from '../src/campaign/campaign.stats.js';
import { CampaignControl } from '../src/campaign/campaign.control.js';
import { isValidEmail, loadCampaign, type CampaignJob, type Recipient } from '../src/campaign/campaign.loader.js';
import { createCampaignWorker } from '../src/campaign/campaign.worker.js';
import { createTransactionalWorker, transactionalJobOptions, type TransactionalJob } from '../src/transactional/transactional.worker.js';

const redis = new Redis(redisConnection);
after(() => redis.quit());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function list(n: number, opts: { invalidEvery?: number; ghostEvery?: number } = {}): Recipient[] {
  return Array.from({ length: n }, (_, k) => {
    const i = k + 1;
    let email = `khach${i}@shopfast.vn`;
    if (opts.invalidEvery && i % opts.invalidEvery === 0) email = `khach${i}@@shopfast`;
    else if (opts.ghostEvery && i % opts.ghostEvery === 0) email = `ghost${i}@shopfast.vn`;
    return { customerId: `KH${i}`, email, name: `Khach ${i}` };
  });
}

/** Moi kiem thu: hang doi, bo dem gioi han va nha cung cap rieng. */
async function env(processes = 2) {
  const prefix = `t-${randomUUID().slice(0, 8)}`;
  const campaignId = `km-${prefix}`;
  const server = new FakeProviderServer();
  const provider = new HttpEmailProvider(await server.start());
  const limiterKey = `${prefix}:calls`;
  const limiter = new ProviderRateLimiter(redis, limiterKey);
  const campaignQueue = new Queue<CampaignJob>(CAMPAIGN_QUEUE, { connection: redisConnection, prefix });
  const txQueue = new Queue<TransactionalJob>(TRANSACTIONAL_QUEUE, { connection: redisConnection, prefix });
  const stats = new CampaignStats(redis, campaignId);
  const control = new CampaignControl(campaignQueue, stats);
  const shared = { connection: redisConnection, prefix, redis, provider, limiter, concurrency: 10 };
  const closers: (() => Promise<unknown>)[] = [];
  const startWorkers = () => {
    for (let i = 0; i < processes; i++) {
      const c = createCampaignWorker(shared);
      const t = createTransactionalWorker(shared);
      closers.push(() => c.close(), () => t.close());
    }
  };
  const waitDone = async (timeoutMs = 60_000) => {
    const start = Date.now();
    while ((await stats.progress()).remaining > 0) {
      if (Date.now() - start > timeoutMs) throw new Error('chien dich chua xong');
      await sleep(100);
    }
  };
  return {
    server, limiterKey, campaignQueue, txQueue, stats, control, startWorkers, waitDone,
    async dispose() {
      await Promise.all(closers.map((c) => c()));
      await campaignQueue.obliterate({ force: true });
      await txQueue.obliterate({ force: true });
      await Promise.all([campaignQueue.close(), txQueue.close(), stats.clear(), server.stop()]);
      const keys = await redis.keys(`${prefix}:*`);
      if (keys.length) await redis.del(...keys);
    },
  };
}

test('Kiem tra dinh dang email', () => {
  for (const ok of ['a@shopfast.vn', 'nguyen.van-a+km@mail.shopfast.com.vn']) assert.ok(isValidEmail(ok), ok);
  for (const bad of ['a@@shopfast.vn', 'a @shopfast.vn', 'a.shopfast.vn', 'a@shopfast', '@shopfast.vn', '']) assert.ok(!isValidEmail(bad), bad);
});

test('Nap danh sach: loai 3% sai dinh dang va dong trung; nap lai khong tao job trung', async () => {
  const e = await env();
  try {
    const recipients = [
      ...list(1000, { invalidEvery: 33 }),
      { customerId: 'KH1', email: 'khac@shopfast.vn', name: 'trung ma khach' },
      { customerId: 'KH9999', email: ' KHACH2@ShopFast.VN ', name: 'trung email' },
    ];
    const r = await loadCampaign(e.campaignQueue, e.stats, recipients);
    assert.deepEqual(r, { total: 1002, queued: 970, invalidFormat: 30, duplicates: 2 });
    assert.equal(await e.campaignQueue.count(), 970);

    await loadCampaign(e.campaignQueue, e.stats, recipients); // tien trinh nap chet giua chung, chay lai
    assert.equal(await e.campaignQueue.count(), 970);
  } finally {
    await e.dispose();
  }
});

test('Bo gioi han: 4 "tien trinh" tranh nhau, khong cua so 1 giay nao vuot 90; chien dich <= 76/s', async () => {
  const e = await env();
  try {
    const limiters = Array.from({ length: 4 }, () => new ProviderRateLimiter(redis, e.limiterKey));
    const grants: { at: number; kind: string }[] = [];
    const end = Date.now() + 3000;
    await Promise.all(
      Array.from({ length: 48 }, async (_, i) => {
        const kind = i % 6 === 0 ? 'transactional' : 'campaign';
        while (Date.now() < end) {
          await limiters[i % 4].acquire(kind);
          grants.push({ at: Date.now(), kind });
        }
      }),
    );
    const peak = (xs: number[]) => {
      xs.sort((a, b) => a - b);
      let best = 0;
      for (let i = 0, j = 0; i < xs.length; i++) {
        while (xs[j] <= xs[i] - 1000) j++;
        best = Math.max(best, i - j + 1);
      }
      return best;
    };
    const all = peak(grants.map((g) => g.at));
    const campaign = peak(grants.filter((g) => g.kind === 'campaign').map((g) => g.at));
    const tx = grants.filter((g) => g.kind === 'transactional').length / 3;
    assert.ok(all <= 92, `tong ${all}/s`); // 90 + sai so do thoi diem phia client
    assert.ok(campaign <= 78, `chien dich ${campaign}/s`);
    assert.ok(tx >= 10, `giao dich van duoc ${tx.toFixed(1)}/s khi chien dich chay het muc`);
  } finally {
    await e.dispose();
  }
});

test('Gui chien dich: moi dia chi dung 1 email, khong ton tai thi khong thu lai, nha cung cap khong bi chan', async () => {
  const e = await env(2);
  try {
    e.server.transientErrorRate = 0.05; // them loi 503 tam thoi
    await loadCampaign(e.campaignQueue, e.stats, list(400, { invalidEvery: 33, ghostEvery: 50 }), { backoffMs: 50 });
    for (let i = 0; i < 30; i++) {
      const key = `tx-${i}`;
      await e.txQueue.add('confirm', { to: `don${i}@shopfast.vn`, subject: 'Xac nhan', html: '-', idempotencyKey: key }, transactionalJobOptions(key));
    }
    e.startWorkers();
    await e.waitDone();
    await sleep(500);

    const p = await e.stats.progress();
    const delivered = e.server.stats.delivered.filter((d) => d.kind === 'campaign').map((d) => d.to);
    // 400 khach: 12 sai dinh dang (boi so cua 33), 8 khong ton tai (boi so cua 50)
    assert.equal(p.invalidFormat, 12);
    assert.equal(p.invalidRecipient, 8);
    assert.equal(p.sent, 400 - 12 - 8);
    assert.equal(p.failed, 0);
    assert.equal(delivered.length, new Set(delivered).size, 'khong dia chi nao nhan 2 email');
    assert.equal(delivered.length, p.sent);
    assert.equal(e.server.stats.rejectedInvalid, 8, 'dia chi khong ton tai chi bi goi 1 lan');
    assert.equal(e.server.stats.blockedCalls, 0);
    assert.ok(e.server.stats.peakPerSecond <= 95, `dinh ${e.server.stats.peakPerSecond}/s`);
    assert.equal(e.server.stats.delivered.filter((d) => d.kind === 'transactional').length, 30);
  } finally {
    await e.dispose();
  }
});

test('Tam dung giua chung: so email gui dung tang (tru job dang goi do), tiep tuc thi chay not', async () => {
  const e = await env(1);
  try {
    await loadCampaign(e.campaignQueue, e.stats, list(300));
    e.startWorkers();
    while ((await e.stats.progress()).sent < 60) await sleep(50);
    await e.control.pause();
    await sleep(300); // job dang goi do ket thuc
    const atPause = (await e.stats.progress()).sent;
    await sleep(1500);
    const later = await e.stats.progress();
    assert.equal(later.sent, atPause, 'khong gui them khi dang tam dung');
    assert.equal(later.state, 'paused');

    await e.control.resume();
    await e.waitDone();
    assert.equal((await e.stats.progress()).sent, 300);
  } finally {
    await e.dispose();
  }
});

test('Dung han chien dich: phan con lai khong bao gio duoc gui', async () => {
  const e = await env(1);
  try {
    await loadCampaign(e.campaignQueue, e.stats, list(300));
    e.startWorkers();
    while ((await e.stats.progress()).sent < 50) await sleep(50);
    await e.control.cancel();
    await sleep(1500);
    const p = await e.stats.progress();
    assert.equal(p.state, 'cancelled');
    assert.equal(p.sent + p.cancelled, 300);
    assert.ok(p.sent < 120, `chi ${p.sent} email da di truoc khi dung`);
    assert.equal(e.server.stats.delivered.length, p.sent);
  } finally {
    await e.dispose();
  }
});

import 'reflect-metadata';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { redisConnection } from '../src/config/redis.config.js';
import { QUEUES, type QueueKey } from '../src/config/queues.config.js';
import { silentLogger } from '../src/common/logger.js';
import { IdempotencyGuard, TaskInProgressError } from '../src/common/idempotency.js';
import { evaluateAlerts } from '../src/monitoring/alert-rules.js';
import type { DashboardSnapshot, QueueSnapshot } from '../src/monitoring/dashboard.types.js';
import { MemoryNotifier } from '../src/monitoring/notifiers.js';
import { ControlCenter } from '../src/queues/control-center.js';
import { createFakePorts } from '../src/tasks/fakes.js';
import { startSystem } from '../src/bootstrap.js';

const redis = new Redis(redisConnection);
after(() => redis.quit());
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const thresholds = Object.fromEntries(Object.entries(QUEUES).map(([k, v]) => [k, v.alerts])) as Record<QueueKey, (typeof QUEUES)[QueueKey]['alerts']>;

// ------------------------------------------------------------------ luat canh bao (ham thuan tuy)

function queue(key: QueueKey, over: Partial<QueueSnapshot> = {}): QueueSnapshot {
  return {
    key, name: key, purpose: '', paused: false, workers: 1, waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0,
    oldestWaitingMs: null, window: { completed: 0, failed: 0, deadLetter: 0, failureRate: 0, ms: 300_000 }, ...over,
  };
}
const snap = (queues: QueueSnapshot[], sinceSuccessMs = 0): DashboardSnapshot => ({
  at: Date.now(),
  queues,
  schedules: [{ id: 'inventory-sync', everyMs: 300_000, staleAfterMs: 900_000, lastSuccessAt: null, sinceSuccessMs }],
});
const types = (s: DashboardSnapshot) => evaluateAlerts(s, thresholds).map((a) => a.id).sort();

test('Luat: he thong binh thuong -> khong canh bao', () => {
  assert.deepEqual(types(snap([queue('critical', { waiting: 10 }), queue('bulk', { waiting: 4000 })])), []);
});

test('Luat: un tac theo so job cho va theo thoi gian cho', () => {
  assert.deepEqual(types(snap([queue('critical', { waiting: 51 })])), ['BACKLOG:critical']);
  assert.deepEqual(types(snap([queue('critical', { waiting: 3, oldestWaitingMs: 11_000 })])), ['SLOW_QUEUE:critical']);
  const [a] = evaluateAlerts(snap([queue('bulk', { waiting: 12_000 })]), thresholds);
  assert.equal(a.severity, 'critical', 'gap doi nguong -> nghiem trong');
});

test('Luat: ti le loi chi tinh khi du mau', () => {
  const w = (completed: number, failed: number) => ({ completed, failed, deadLetter: 0, failureRate: failed / (completed + failed), ms: 300_000 });
  assert.deepEqual(types(snap([queue('critical', { window: w(1, 2) })])), [], '3 mau < 20: chua ket luan');
  assert.deepEqual(types(snap([queue('critical', { window: w(30, 10) })])), ['FAILURE_RATE:critical']);
});

test('Luat: mat worker va viec dinh ky lau khong chay thanh cong', () => {
  assert.deepEqual(types(snap([queue('heavy', { workers: 0, waiting: 2 })])), ['NO_WORKER:heavy']);
  assert.deepEqual(types(snap([queue('heavy', { workers: 0, waiting: 2, paused: true })])), [], 'tam dung co chu dich');
  assert.deepEqual(types(snap([], 16 * 60_000)), ['STALE_SCHEDULE:inventory-sync']);
});

// ------------------------------------------------------------------ bat bien khi lap

test('Chong lap: cung khoa chi chay 1 lan, chay dong thoi bi chan, loi thi nha khoa', async () => {
  const guard = new IdempotencyGuard(redis, `t-${randomUUID()}`);
  let effects = 0;
  const work = async () => {
    await sleep(100);
    return ++effects;
  };
  const [a, b] = await Promise.allSettled([guard.runOnce('k1', 5_000, work), guard.runOnce('k1', 5_000, work)]);
  assert.equal(a.status, 'fulfilled');
  assert.ok(b.status === 'rejected' && b.reason instanceof TaskInProgressError);
  assert.deepEqual(await guard.runOnce('k1', 5_000, work), { skipped: true });
  assert.equal(effects, 1);

  await assert.rejects(guard.runOnce('k2', 5_000, async () => { throw new Error('loi'); }));
  assert.deepEqual(await guard.runOnce('k2', 5_000, work), { skipped: false, result: 2 }, 'lan sau chay lai duoc');
});

// ------------------------------------------------------------------ tich hop voi BullMQ + Redis

function fastConfig() {
  const q = structuredClone(QUEUES);
  q.bulk.alerts = { ...q.bulk.alerts, maxWaiting: 20 };
  q.bulk.job.backoff = { type: 'fixed', delay: 50 };
  q.scheduled.job.backoff = { type: 'fixed', delay: 50 };
  q.scheduled.job.attempts = 1;
  return q;
}

async function center(schedules = [{ id: 'inventory-sync', task: 'inventory-sync' as const, everyMs: 300, staleAfterMs: 1_500 }]) {
  const ports = createFakePorts();
  const notifier = new MemoryNotifier();
  const c = new ControlCenter({
    connection: redisConnection, redis, ns: `t-${randomUUID().slice(0, 8)}`, ports, notifiers: [notifier], logger: silentLogger,
    queues: fastConfig(), schedules, monitor: { intervalMs: 200, failureWindowMs: 10_000, renotifyMs: 60_000 },
  });
  return { c, ports, notifier, fired: (id: string, status = 'firing') => notifier.events.some((e) => e.id === id && e.status === status) };
}

async function until(cond: () => boolean | Promise<boolean>, timeoutMs = 20_000) {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > timeoutMs) throw new Error('het thoi gian cho');
    await sleep(50);
  }
}

test('Un tac hang doi bulk -> canh bao bat; xu ly het -> canh bao tu tat', async () => {
  const { c, fired } = await center();
  try {
    await c.start(['critical', 'heavy', 'scheduled']); // chua co worker bulk
    for (let i = 0; i < 40; i++) await c.enqueue('bulk-price-update', { batchId: `b${i}`, items: [{ sku: `S${i}`, price: 1000 }] });
    await until(() => fired('BACKLOG:bulk'));
    assert.ok(fired('NO_WORKER:bulk'));

    c.startWorker('bulk');
    await until(() => fired('BACKLOG:bulk', 'resolved') && fired('NO_WORKER:bulk', 'resolved'));
    await until(async () => (await c.queues.bulk.getJobCounts('completed')).completed === 40);
    assert.equal((await c.snapshot()).queues.find((q) => q.key === 'bulk')!.waiting, 0);
  } finally {
    await c.obliterate();
    await c.close();
  }
});

test('Viec dinh ky that bai lien tuc -> canh bao "lau khong chay thanh cong"; ERP song lai -> het', async () => {
  const { c, ports, fired } = await center();
  try {
    ports.erp.down = true;
    await c.start();
    await until(() => fired('STALE_SCHEDULE:inventory-sync'));
    ports.erp.down = false;
    await until(() => fired('STALE_SCHEDULE:inventory-sync', 'resolved'));
    assert.equal(ports.catalog.stock.AO, 120);
  } finally {
    await c.obliterate();
    await c.close();
  }
});

test('Them trung va job chay lai khong tao tac dung phu lap; du lieu hong khong thu lai, khong sap', async () => {
  const { c, ports } = await center([]);
  try {
    await c.start();
    for (let i = 0; i < 3; i++) await c.enqueue('send-otp', { otpId: 'otp-1', phone: '0900', code: '123456' });
    const job = await c.queues.bulk.add('bulk-price-update', { batchId: 'hong', items: [{ sku: 'A', price: -1 }] });
    await c.queues.bulk.add('lenh-la', {});
    await until(
      async () =>
        (await c.queues.bulk.getJobCounts('failed')).failed === 2 &&
        (await c.queues.critical.getJobCounts('completed')).completed === 1,
    );
    assert.equal((await c.queues.critical.getJobCounts('completed')).completed, 1, 'chi 1 job cho otp-1');
    assert.equal((await c.queues.bulk.getJob(job.id!))?.attemptsMade, 1, 'du lieu hong: khong thu lai');

    // job da xong bi them lai sau khi bi xoa khoi hang doi -> lop chong lap trong Redis chan
    await c.queues.critical.obliterate({ force: true });
    await c.enqueue('send-otp', { otpId: 'otp-1', phone: '0900', code: '123456' });
    await until(async () => (await c.queues.critical.getJobCounts('completed')).completed === 1);
    assert.equal(ports.sms.sent.size, 1);
  } finally {
    await c.obliterate();
    await c.close();
  }
});

test('Bang dieu khien HTTP tra ve so job cua ca 4 hang doi', async () => {
  const sys = await startSystem({ ns: `t-${randomUUID().slice(0, 8)}`, port: 3599, ports: createFakePorts(), logger: silentLogger });
  try {
    await sys.center.enqueue('export-report', { reportId: 'r1', month: '2026-10' });
    const body = (await (await fetch('http://localhost:3599/api/dashboard')).json()) as DashboardSnapshot;
    assert.deepEqual(body.queues.map((q) => q.key), ['critical', 'heavy', 'scheduled', 'bulk']);
    for (const q of body.queues) for (const f of ['waiting', 'active', 'completed', 'failed'] as const) assert.equal(typeof q[f], 'number');
    const html = await (await fetch('http://localhost:3599/')).text();
    assert.match(html, /Trung tam dieu hanh tac vu nen/);
  } finally {
    await sys.center.obliterate();
    await sys.shutdown();
  }
});

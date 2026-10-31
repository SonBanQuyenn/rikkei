import 'reflect-metadata';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Queue, Worker, type WorkerOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { redisConnection } from '../src/config/redis.config.js';
import { MailerService, type MailProvider, type SendMailRequest } from '../src/mailer/mailer.service.js';
import { OrderRepository } from '../src/order/order.repository.js';
import { BuggyOrderService } from '../src/order/order.service.buggy.js';
import { OrderService } from '../src/order/order.service.js';
import { BuggyEmailProcessor } from '../src/email/email.processor.buggy.js';
import { EmailProcessor } from '../src/email/email.processor.js';
import { EmailIdempotencyStore } from '../src/email/email-idempotency.store.js';

type Variant = 'buggy' | 'fixed';
type Fault = 'ok' | 'down' | 'deliver-then-timeout' | 'deliver-then-hang';

/**
 * Nha cung cap email gia lap. Giong nha cung cap that: neu request co Idempotency-Key da gap,
 * tra lai messageId cu va KHONG gui them thu.
 */
class FakeMailProvider implements MailProvider {
  readonly delivered: SendMailRequest[] = [];
  readonly callTimes: number[] = [];
  private readonly byKey = new Map<string, string>();
  onHang?: () => void;

  constructor(private readonly fault: (call: number) => Fault = () => 'ok') {}

  get calls() {
    return this.callTimes.length;
  }

  async send(req: SendMailRequest) {
    this.callTimes.push(Date.now());
    const mode = this.fault(this.calls);
    if (mode === 'down') throw new Error('ECONNREFUSED smtp.provider.local');

    let messageId = req.idempotencyKey ? this.byKey.get(req.idempotencyKey) : undefined;
    if (!messageId) {
      this.delivered.push(req);
      messageId = `msg-${this.delivered.length}`;
      if (req.idempotencyKey) this.byKey.set(req.idempotencyKey, messageId);
    }

    if (mode === 'deliver-then-timeout') throw new Error('ETIMEDOUT: provider khong phan hoi sau 10s');
    if (mode === 'deliver-then-hang') {
      this.onHang?.();
      return new Promise<never>(() => {}); // tien trinh "chet" ngay sau khi thu da di
    }
    return { messageId };
  }
}

const redis = new Redis(redisConnection);
after(() => redis.quit());

async function waitUntil(cond: () => Promise<boolean> | boolean, timeoutMs = 20_000) {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

function harness(variant: Variant, provider: FakeMailProvider, opts: { backoffMs?: number } = {}) {
  const name = `order-email-test-${randomUUID()}`;
  const queue = new Queue(name, { connection: redisConnection });
  const repo = new OrderRepository();
  const mailer = new MailerService(provider);
  const processor =
    variant === 'buggy'
      ? new BuggyEmailProcessor(mailer)
      : new EmailProcessor(mailer, new EmailIdempotencyStore(redis));
  const orders =
    variant === 'buggy' ? new BuggyOrderService(repo, queue) : new OrderService(repo, queue, opts.backoffMs);
  const workers: Worker[] = [];

  return {
    name,
    queue,
    orders,
    startWorker(workerOpts: Partial<WorkerOptions> = {}) {
      const w = new Worker(name, (job) => processor.process(job), { connection: redisConnection, ...workerOpts });
      workers.push(w);
      return w;
    },
    async idle() {
      const c = await queue.getJobCounts('wait', 'active', 'delayed', 'prioritized', 'waiting-children');
      return Object.values(c).every((n) => n === 0);
    },
    async dispose() {
      await Promise.all(workers.map((w) => w.close(true)));
      await queue.obliterate({ force: true });
      await queue.close();
    },
  };
}

const newOrder = () => ({ email: `khach-${randomUUID().slice(0, 8)}@shopfast.vn`, items: [{ sku: 'A', qty: 1 }] });

// ---------------------------------------------------------------------------
// K1. Nha cung cap nhan thu nhung phan hoi bi timeout -> moi lan thu lai gui them mot thu
// ---------------------------------------------------------------------------
async function scenarioRetryAfterDelivered(variant: Variant) {
  // 4 lan dau: thu da di nhung phan hoi bi timeout; lan 5 phan hoi binh thuong
  const provider = new FakeMailProvider((call) => (call <= 4 ? 'deliver-then-timeout' : 'ok'));
  const h = harness(variant, provider, { backoffMs: 50 });
  try {
    h.startWorker();
    const order = await h.orders.createOrder(newOrder());
    await waitUntil(() => provider.calls >= 5 && h.idle());
    return { calls: provider.calls, emails: provider.delivered.filter((m) => m.body.includes(order.id)).length };
  } finally {
    await h.dispose();
  }
}

test('K1 - ban goc: 1 don nhan 5 email giong het nhau khi phan hoi nha cung cap bi timeout', async (t) => {
  const r = await scenarioRetryAfterDelivered('buggy');
  t.diagnostic(JSON.stringify(r));
  assert.equal(r.calls, 5);
  assert.equal(r.emails, 5);
});

test('K1 - ban sua: van 5 lan goi nhung khach chi nhan 1 email', async (t) => {
  const r = await scenarioRetryAfterDelivered('fixed');
  t.diagnostic(JSON.stringify(r));
  assert.equal(r.calls, 5);
  assert.equal(r.emails, 1);
});

// ---------------------------------------------------------------------------
// K2. Tien trinh chet ngay sau khi gui (deploy/OOM) -> job "stalled" bi worker khac chay lai tu dau
// ---------------------------------------------------------------------------
async function scenarioStalledAfterSend(variant: Variant) {
  const provider = new FakeMailProvider((call) => (call === 1 ? 'deliver-then-hang' : 'ok'));
  const h = harness(variant, provider, { backoffMs: 50 });
  const fastStall = { lockDuration: 1000, stalledInterval: 500 };
  try {
    const workerA = h.startWorker(fastStall);
    const crashed = new Promise<void>((resolve) => {
      provider.onHang = () => void workerA.close(true).then(resolve); // worker A mat, khong bao xong job
    });
    await h.orders.createOrder(newOrder());
    await crashed;

    h.startWorker(fastStall); // worker B khoi dong lai sau deploy
    await waitUntil(async () => provider.calls >= 2 && (await h.idle()));
    return { calls: provider.calls, emails: provider.delivered.length };
  } finally {
    await h.dispose();
  }
}

test('K2 - ban goc: worker chet sau khi gui, worker khac chay lai job -> khach nhan 2 email', async (t) => {
  const r = await scenarioStalledAfterSend('buggy');
  t.diagnostic(JSON.stringify(r));
  assert.equal(r.emails, 2);
});

test('K2 - ban sua: job duoc chay lai nhung khach chi nhan 1 email', async (t) => {
  const r = await scenarioStalledAfterSend('fixed');
  t.diagnostic(JSON.stringify(r));
  assert.equal(r.calls, 2);
  assert.equal(r.emails, 1);
});

// ---------------------------------------------------------------------------
// K3. Khong co thoi gian cho giua cac lan thu: 5 lan thu don dap trong vai ms -> mat email khi
//     nha cung cap gian doan ngan
// ---------------------------------------------------------------------------
async function scenarioShortOutage(variant: Variant) {
  const outageUntil = Date.now() + 1500; // nha cung cap gian doan 1,5 giay
  const provider = new FakeMailProvider(() => (Date.now() < outageUntil ? 'down' : 'ok'));
  const h = harness(variant, provider); // ban sua dung backoff mac dinh (1s, 2s, 4s, 8s)
  try {
    h.startWorker();
    await h.orders.createOrder(newOrder());
    await waitUntil(() => h.idle(), 30_000);
    const failed = await h.queue.getJobCounts('failed');
    return {
      calls: provider.calls,
      spreadMs: provider.callTimes.at(-1)! - provider.callTimes[0],
      emails: provider.delivered.length,
      failed: failed.failed,
    };
  } finally {
    await h.dispose();
  }
}

test('K3 - ban goc: 5 lan thu dien ra trong < 1s, job that bai, khach khong nhan email nao', async (t) => {
  const r = await scenarioShortOutage('buggy');
  t.diagnostic(JSON.stringify(r));
  assert.equal(r.calls, 5);
  assert.ok(r.spreadMs < 1000, `5 lan thu trai trong ${r.spreadMs}ms`);
  assert.equal(r.emails, 0);
  assert.equal(r.failed, 1);
});

test('K3 - ban sua: thu lai gian dan, vuot qua su co va gui dung 1 email', async (t) => {
  const r = await scenarioShortOutage('fixed');
  t.diagnostic(JSON.stringify(r));
  assert.ok(r.spreadMs >= 1500, `lan thu cuoi cach lan dau ${r.spreadMs}ms`);
  assert.equal(r.emails, 1);
  assert.equal(r.failed, 0);
});

// ---------------------------------------------------------------------------
// K4. Job hoan tat khong bao gio bi xoa -> so khoa Redis tang tuyen tinh theo so don
// ---------------------------------------------------------------------------
async function scenarioRedisGrowth(variant: Variant, orderCount: number) {
  const provider = new FakeMailProvider();
  const h = harness(variant, provider);
  try {
    h.startWorker({ concurrency: 20 });
    for (let i = 0; i < orderCount; i++) await h.orders.createOrder(newOrder());
    await waitUntil(async () => provider.calls >= orderCount && (await h.idle()));
    await new Promise((r) => setTimeout(r, 200));
    const keys = await redis.keys(`bull:${h.name}:*`);
    const completed = (await h.queue.getJobCounts('completed')).completed;
    return { emails: provider.delivered.length, queueKeys: keys.length, completed };
  } finally {
    await h.dispose();
  }
}

test('K4 - ban goc: 300 don -> 300 job hoan tat van nam trong Redis (tang mai khong giam)', async (t) => {
  const r = await scenarioRedisGrowth('buggy', 300);
  t.diagnostic(JSON.stringify(r));
  assert.equal(r.emails, 300);
  assert.equal(r.completed, 300);
  assert.ok(r.queueKeys >= 300, `so khoa cua hang doi: ${r.queueKeys}`);
});

test('K4 - ban sua: 300 don -> khong con job hoan tat nao, chi con vai khoa quan tri cua hang doi', async (t) => {
  const r = await scenarioRedisGrowth('fixed', 300);
  t.diagnostic(JSON.stringify(r));
  assert.equal(r.emails, 300);
  assert.equal(r.completed, 0);
  assert.ok(r.queueKeys < 10, `so khoa cua hang doi: ${r.queueKeys}`);
});

test('Dau "da gui" luon co TTL nen cung khong lam Redis phinh', async (t) => {
  const store = new EmailIdempotencyStore(redis);
  const orderId = randomUUID();
  await store.markSent(orderId, 'msg-1');
  const ttl = await redis.ttl(EmailIdempotencyStore.key(orderId));
  assert.ok(ttl > 0 && ttl <= 30 * 24 * 3600);
  await redis.del(EmailIdempotencyStore.key(orderId));
});

test('Goi add() lap lai cho cung mot don chi tao 1 job (jobId co dinh)', async (t) => {
  const provider = new FakeMailProvider();
  const h = harness('fixed', provider);
  try {
    const { confirmationJobOptions } = await import('../src/email/email-queue.options.js');
    const data = { orderId: randomUUID(), email: 'a@shopfast.vn' };
    await h.queue.add('send-confirmation', data, confirmationJobOptions(data.orderId));
    await h.queue.add('send-confirmation', data, confirmationJobOptions(data.orderId));
    assert.equal((await h.queue.getJobCounts('wait')).wait, 1);
  } finally {
    await h.dispose();
  }
});

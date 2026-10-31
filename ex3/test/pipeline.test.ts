import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';
import { redisConnection } from '../src/config/redis.config.js';
import { OrderRepository } from '../src/domain/order.repository.js';
import { TERMINAL_STATUSES, type Order } from '../src/domain/order.js';
import { createFakeIntegrations, type FakeIntegrations } from '../src/integrations/fakes.js';
import { OrderPipeline, type PipelineOptions } from '../src/pipeline/order-pipeline.js';

const redis = new Redis(redisConnection);
after(() => redis.quit());

const customer = { email: 'khach@shopfast.vn', phone: '0900000000' };
const AO = [{ sku: 'AO', qty: 1 }];

function setup(opts: { idempotentGateway?: boolean } = {}) {
  const ns = `test-${randomUUID().slice(0, 8)}`;
  const repo = new OrderRepository(redis, ns);
  const deps = createFakeIntegrations({ AO: 10, QUAN: 0 }, opts);
  const pipelineOpts: PipelineOptions = {
    connection: redisConnection,
    prefix: ns,
    backoffOverrideMs: 20,
    paymentTimeoutMs: 300,
    worker: { lockDuration: 1000, stalledInterval: 500 },
  };
  const pipelines: OrderPipeline[] = [];
  const newPipeline = () => {
    const p = new OrderPipeline(repo, deps, pipelineOpts);
    pipelines.push(p);
    return p;
  };
  return {
    repo,
    deps,
    newPipeline,
    async waitFinished(id: string, timeoutMs = 20_000): Promise<Order> {
      const start = Date.now();
      for (;;) {
        const o = await repo.get(id);
        if (TERMINAL_STATUSES.includes(o.status)) return o;
        if (Date.now() - start > timeoutMs) throw new Error(`Don ${id} dung o ${o.status}`);
        await new Promise((r) => setTimeout(r, 30));
      }
    },
    async dispose() {
      await pipelines.at(-1)!.obliterate();
      await Promise.all(pipelines.map((p) => p.close(true)));
      await repo.clear();
    },
  };
}

const statuses = (o: Order) => o.history.map((h) => h.status);

async function runOne(configure: (deps: FakeIntegrations, orderId: string) => void, items = AO, opts = {}) {
  const env = setup(opts);
  try {
    const pipeline = env.newPipeline();
    const placed = await pipeline.placeOrder({ customer, items, amount: 250_000 });
    configure(env.deps, placed.id);
    pipeline.startWorkers();
    return { order: await env.waitFinished(placed.id), deps: env.deps };
  } finally {
    await env.dispose();
  }
}

test('Thanh cong: di qua du 5 buoc, trang thai cap nhat sau moi buoc, moi he thong goi dung 1 lan', async () => {
  const { order, deps } = await runOne(() => {});
  assert.deepEqual(statuses(order), ['PLACED', 'STOCK_RESERVED', 'PAID', 'INVOICED', 'READY_TO_SHIP', 'SHIPPED']);
  assert.equal(deps.payment.charges.length, 1);
  assert.equal(deps.einvoice.issued.size, 1);
  assert.deepEqual([deps.notification.emails.length, deps.notification.sms.length], [1, 1]);
  assert.equal(deps.shipping.shipments.size, 1);
});

test('Buoc 1 het hang: huy don + hoan tien, cac buoc sau khong chay', async () => {
  const { order, deps } = await runOne(() => {}, [{ sku: 'QUAN', qty: 1 }]);
  assert.deepEqual(statuses(order), ['PLACED', 'CANCELLED']);
  assert.equal(order.cancelReason, 'OUT_OF_STOCK');
  assert.equal(deps.payment.refunds.length, 1);
  assert.equal(deps.payment.captureCalls, 0);
  assert.equal(deps.einvoice.calls + deps.shipping.calls + deps.notification.emails.length, 0);
});

test('Buoc 2 cong tu choi: tra hang ve kho roi huy don', async () => {
  const { order, deps } = await runOne((d) => (d.payment.fault = () => 'decline'));
  assert.deepEqual(statuses(order), ['PLACED', 'STOCK_RESERVED', 'CANCELLED']);
  assert.equal(order.cancelReason, 'PAYMENT_FAILED');
  assert.equal(deps.inventory.stock.get('AO'), 10, 'hang da duoc tra ve kho');
  assert.equal(deps.payment.charges.length, 0);
  assert.equal(deps.einvoice.calls, 0);
});

test('Buoc 2 cong loi het so lan thu: tra hang, huy don, khong tru tien', async () => {
  const { order, deps } = await runOne((d) => (d.payment.fault = () => 'fail'));
  assert.equal(order.status, 'CANCELLED');
  assert.equal(deps.payment.captureCalls, 4);
  assert.equal(deps.inventory.stock.get('AO'), 10);
  assert.equal(deps.payment.charges.length, 0);
});

for (const idempotentGateway of [true, false]) {
  test(`Bay: cong da tru tien nhung het thoi gian cho -> thu lai KHONG tru lan hai (cong ${idempotentGateway ? 'co' : 'KHONG'} ho tro idempotency)`, async () => {
    const { order, deps } = await runOne(
      (d, id) => (d.payment.fault = (oid) => (oid === id && d.payment.charges.length === 0 ? 'charge-then-hang' : 'ok')),
      AO,
      { idempotentGateway },
    );
    assert.equal(order.status, 'SHIPPED');
    assert.equal(deps.payment.charges.length, 1, 'khach chi bi tru tien 1 lan');
    assert.equal(deps.payment.captureCalls, 1, 'lan thu 2 tra cuu thay da tru nen khong goi lenh tru');
    assert.match(order.history.find((h) => h.status === 'PAID')!.note, /khong tru lai/);
  });
}

test('Buoc 3 hong ca 5 lan: bao ke toan, don van tiep tuc toi giao van chuyen', async () => {
  const { order, deps } = await runOne((d) => (d.einvoice.fault = () => 'fail'));
  assert.equal(deps.einvoice.calls, 5);
  assert.deepEqual(statuses(order), ['PLACED', 'STOCK_RESERVED', 'PAID', 'INVOICE_MANUAL', 'READY_TO_SHIP', 'SHIPPED']);
  assert.equal(deps.accounting.tasks.length, 1);
  assert.equal(deps.accounting.tasks[0].kind, 'E_INVOICE');
});

test('Buoc 4 SMS hong: khong anh huong don, email khong bi gui lap qua cac lan thu', async () => {
  const { order, deps } = await runOne((d) => (d.notification.smsFault = () => 'fail'));
  assert.equal(order.status, 'SHIPPED');
  assert.deepEqual(order.notification, { email: 'SENT', sms: 'FAILED' });
  assert.equal(deps.notification.emails.length, 1);
});

test('Buoc 5 hong het so lan thu: SHIPPING_FAILED va tao viec cho van hanh', async () => {
  const { order, deps } = await runOne((d) => (d.shipping.fault = () => 'fail'));
  assert.equal(order.status, 'SHIPPING_FAILED');
  assert.equal(deps.shipping.calls, 6);
  assert.equal(deps.accounting.tasks[0].kind, 'SHIPPING');
});

test('Bay: toan bo tien trinh khoi dong lai giua buoc 2 -> tiep tuc tu buoc 2, khong chay lai buoc 1, tru tien 1 lan', async () => {
  const env = setup();
  try {
    const p1 = env.newPipeline();
    const placed = await p1.placeOrder({ customer, items: AO, amount: 250_000 });
    let calls = 0;
    env.deps.payment.fault = () => (++calls === 1 ? 'charge-then-hang' : 'ok');
    p1.startWorkers();
    while (calls === 0) await new Promise((r) => setTimeout(r, 10));
    await p1.close(true); // tien trinh chet dot ngot khi dang cho cong thanh toan

    const mid = await env.repo.get(placed.id);
    assert.deepEqual(mid.completedSteps, ['reserve-stock']);

    const p2 = env.newPipeline();
    p2.startWorkers();
    await p2.recover();
    const order = await env.waitFinished(placed.id);

    assert.equal(order.status, 'SHIPPED');
    assert.equal(env.deps.inventory.reserveCalls, 1, 'buoc 1 khong chay lai');
    assert.equal(env.deps.payment.charges.length, 1, 'khong tru tien lan hai');
    assert.deepEqual(statuses(order), ['PLACED', 'STOCK_RESERVED', 'PAID', 'INVOICED', 'READY_TO_SHIP', 'SHIPPED']);
  } finally {
    await env.dispose();
  }
});

test('Bay: tien trinh chet ngay sau khi ghi CSDL nhung truoc khi dua buoc ke vao hang doi -> recover() noi tiep', async () => {
  const env = setup();
  try {
    // Tai hien: buoc 1 da ghi xong vao CSDL nhung job buoc 2 chua kip duoc tao.
    const order = await env.repo.create({ customer, items: AO, amount: 250_000 });
    await env.deps.inventory.reserve(order.id, AO);
    await env.repo.completeStep(order.id, 'reserve-stock', 'STOCK_RESERVED', 'Da giu hang');

    const p = env.newPipeline();
    p.startWorkers();
    assert.equal(await p.recover(), 1);
    const done = await env.waitFinished(order.id);
    assert.equal(done.status, 'SHIPPED');
    assert.equal(env.deps.inventory.reserveCalls, 1);
  } finally {
    await env.dispose();
  }
});

/**
 * Chay thu day chuyen voi cac he thong gia lap va nhieu kich ban that bai.
 *   npm start   (can Redis tai REDIS_URL)
 */
import { Redis } from 'ioredis';
import { redisConnection } from './config/redis.config.js';
import { OrderRepository } from './domain/order.repository.js';
import { TERMINAL_STATUSES, type Order } from './domain/order.js';
import { createFakeIntegrations } from './integrations/fakes.js';
import { OrderPipeline } from './pipeline/order-pipeline.js';

const ns = `demo-${Date.now()}`;
const redis = new Redis(redisConnection);
const repo = new OrderRepository(redis, ns);
const deps = createFakeIntegrations({ AO: 100, QUAN: 0 });
const pipelineOpts = {
  connection: redisConnection,
  prefix: ns,
  backoffOverrideMs: 100, // demo: rut ngan thoi gian cho giua cac lan thu
  paymentTimeoutMs: 500,
  worker: { lockDuration: 2000, stalledInterval: 1000 },
};
let pipeline = new OrderPipeline(repo, deps, pipelineOpts);

const customer = { email: 'khach@shopfast.vn', phone: '0900000000' };
const scenarios = {
  'Thanh cong tron ven': { items: [{ sku: 'AO', qty: 1 }] },
  'Het hang (buoc 1)': { items: [{ sku: 'QUAN', qty: 1 }] },
  'Cong thanh toan tu choi (buoc 2)': { items: [{ sku: 'AO', qty: 1 }] },
  'Tru tien xong nhung phan hoi bi het gio (buoc 2)': { items: [{ sku: 'AO', qty: 1 }] },
  'Hoa don dien tu hong ca 5 lan (buoc 3)': { items: [{ sku: 'AO', qty: 1 }] },
  'SMS that bai (buoc 4)': { items: [{ sku: 'AO', qty: 1 }] },
  'Tien trinh khoi dong lai giua buoc 2': { items: [{ sku: 'AO', qty: 2 }] },
} as const;
type Scenario = keyof typeof scenarios;

async function waitFinished(ids: string[]) {
  for (;;) {
    const orders = await Promise.all(ids.map((id) => repo.get(id)));
    if (orders.every((o) => TERMINAL_STATUSES.includes(o.status))) return orders;
    await new Promise((r) => setTimeout(r, 100));
  }
}

function printTimeline(title: string, o: Order) {
  console.log(`\n### ${title}  (don ${o.id.slice(0, 8)})`);
  for (const h of o.history) console.log(`  ${h.at.slice(11, 23)}  ${h.status.padEnd(15)} ${h.note}`);
}

async function main() {
  const byId = new Map<string, Scenario>();
  for (const [title, s] of Object.entries(scenarios) as [Scenario, (typeof scenarios)[Scenario]][]) {
    const o = await pipeline.placeOrder({ customer, items: [...s.items], amount: 250_000 });
    byId.set(o.id, title);
  }
  const is = (id: string, t: Scenario) => byId.get(id) === t;
  let restartCaptureCalls = 0;

  deps.payment.fault = (id) => {
    if (is(id, 'Cong thanh toan tu choi (buoc 2)')) return 'decline';
    if (is(id, 'Tru tien xong nhung phan hoi bi het gio (buoc 2)') && deps.payment.charges.every((c) => c.orderId !== id))
      return 'charge-then-hang';
    if (is(id, 'Tien trinh khoi dong lai giua buoc 2') && ++restartCaptureCalls === 1) return 'charge-then-hang';
    return 'ok';
  };
  deps.einvoice.fault = (id) => (is(id, 'Hoa don dien tu hong ca 5 lan (buoc 3)') ? 'fail' : 'ok');
  deps.notification.smsFault = (id) => (is(id, 'SMS that bai (buoc 4)') ? 'fail' : 'ok');

  // Tien trinh #1: chet dot ngot khi don "khoi dong lai" dang treo o buoc 2.
  pipeline.startWorkers();
  const restartId = [...byId].find(([, t]) => t === 'Tien trinh khoi dong lai giua buoc 2')![0];
  while (restartCaptureCalls === 0) await new Promise((r) => setTimeout(r, 20));
  const before = await repo.get(restartId);
  console.log(`>>> Tien trinh #1 bi dung dot ngot. Don ${restartId.slice(0, 8)} dang o trang thai ${before.status}, buoc xong: [${before.completedSteps}]`);
  await pipeline.close(true);

  // Tien trinh #2: khoi dong lai, noi tiep cac don dang do.
  pipeline = new OrderPipeline(repo, deps, pipelineOpts);
  pipeline.startWorkers();
  console.log(`>>> Tien trinh #2 khoi dong, recover() noi tiep ${await pipeline.recover()} don chua ket thuc`);

  const orders = await waitFinished([...byId.keys()]);
  for (const o of orders) printTimeline(byId.get(o.id)!, o);

  console.log('\n### He thong ben ngoai');
  console.log(`  So lan tru tien that: ${deps.payment.charges.length} (moi don thanh toan thanh cong dung 1 lan)`);
  for (const id of byId.keys()) {
    const n = deps.payment.charges.filter((c) => c.orderId === id).length;
    console.log(`    ${byId.get(id)!.padEnd(50)} tru ${n} lan`);
  }
  console.log(`  Hoan tien: ${deps.payment.refunds.length}, viec ke toan/van hanh: ${deps.accounting.tasks.map((t) => t.kind).join(', ')}`);
  console.log(`  Giu hang do don "khoi dong lai": goi reserve ${deps.inventory.reserveCalls} lan cho ${byId.size} don, ton AO con ${deps.inventory.stock.get('AO')}`);

  await pipeline.obliterate();
  await pipeline.close();
  await repo.clear();
  await redis.quit();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

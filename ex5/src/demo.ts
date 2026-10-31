/**
 * Kich ban demo: he thong chay binh thuong -> lan luot gay su co (un tac, ti le loi cao, viec dinh ky chet,
 * mat worker, du lieu hong) -> bang dieu khien va canh bao phan ung -> khoi phuc -> canh bao tu het.
 * Nguong va lich duoc rut ngan de demo chay trong ~1 phut.
 *   npm run demo   (can Redis)
 */
import { randomUUID } from 'node:crypto';
import { QUEUES, type QueueConfig, type QueueKey } from './config/queues.config.js';
import { consoleLogger } from './common/logger.js';
import { installProcessGuards, startSystem } from './bootstrap.js';
import { createFakePorts } from './tasks/fakes.js';
import type { DashboardSnapshot } from './monitoring/dashboard.types.js';

const PORT = 3500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const logger = consoleLogger('demo');
const say = (msg: string) => console.log(`\n=== ${msg} ===`);

function demoQueues(): Record<QueueKey, QueueConfig> {
  const q = structuredClone(QUEUES);
  q.critical.job.backoff = { type: 'exponential', delay: 200 };
  q.critical.job.attempts = 3;
  q.heavy.worker.lockDuration = 30_000;
  q.heavy.job.backoff = { type: 'exponential', delay: 1_000 };
  q.scheduled.job.backoff = { type: 'fixed', delay: 300 };
  q.scheduled.job.attempts = 2;
  q.bulk.job.backoff = { type: 'exponential', delay: 500 };
  q.bulk.alerts = { ...q.bulk.alerts, maxWaiting: 100, maxWaitMs: 15_000 };
  return q;
}

async function printDashboard() {
  const snap = (await (await fetch(`http://localhost:${PORT}/api/dashboard`)).json()) as DashboardSnapshot & {
    activeAlerts: { severity: string; message: string }[];
  };
  console.log('hang doi  | cho  | chay | thu lai | xong | loi | worker | ti le loi | cho lau nhat');
  for (const q of snap.queues) {
    console.log(
      `${q.key.padEnd(9)} | ${String(q.waiting).padStart(4)} | ${String(q.active).padStart(4)} | ${String(q.delayed).padStart(7)} | ` +
        `${String(q.completed).padStart(4)} | ${String(q.failed).padStart(3)} | ${String(q.workers).padStart(6)} | ` +
        `${`${Math.round(q.window.failureRate * 100)}%`.padStart(9)} | ${q.oldestWaitingMs === null ? '-' : `${(q.oldestWaitingMs / 1000).toFixed(1)}s`}`,
    );
  }
  for (const s of snap.schedules) console.log(`dinh ky "${s.id}": thanh cong gan nhat cach day ${(s.sinceSuccessMs / 1000).toFixed(1)}s`);
  console.log(`canh bao dang mo: ${snap.activeAlerts.length ? '' : 'khong co'}`);
  for (const a of snap.activeAlerts) console.log(`  - [${a.severity}] ${a.message}`);
}

async function main() {
  const ports = createFakePorts();
  const ns = `demo-${randomUUID().slice(0, 6)}`;
  const system = await startSystem({
    ns,
    port: PORT,
    ports,
    logger: consoleLogger('control-center'),
    overrides: {
      queues: demoQueues(),
      schedules: [{ id: 'inventory-sync', task: 'inventory-sync', everyMs: 2_000, staleAfterMs: 6_000 }],
      monitor: { intervalMs: 1_000, failureWindowMs: 20_000, renotifyMs: 60_000 },
    },
  });
  installProcessGuards(logger, system.shutdown);
  const { center } = system;
  const otp = (i: number) => center.enqueue('send-otp', { otpId: `otp-${ns}-${i}`, phone: `09000000${i % 100}`, code: String(100000 + i) });
  const bulk = (i: number) =>
    center.enqueue('bulk-price-update', {
      batchId: `${ns}-b${i}`,
      items: Array.from({ length: 50 }, (_, k) => ({ sku: `SKU-${i}-${k}`, price: 99_000 + k })),
    });

  say('1. Hoat dong binh thuong: 30 OTP, 2 bao cao thang, 20 lo cap nhat gia, dong bo ton kho moi 2s');
  for (let i = 0; i < 30; i++) await otp(i);
  await center.enqueue('export-report', { reportId: `${ns}-r1`, month: '2026-09' });
  await center.enqueue('export-report', { reportId: `${ns}-r2`, month: '2026-10' });
  for (let i = 0; i < 20; i++) await bulk(i);
  await sleep(4_000);
  await printDashboard();

  say('2. Bat bien khi lap: gui lai OTP otp-0 hai lan + them lai lo b0 (da xong)');
  await otp(0);
  await otp(0);
  await bulk(0);
  await sleep(1_500);
  const otp0 = [...ports.sms.sent.keys()].filter((k) => k === `otp-otp-${ns}-0`).length;
  logger.info(`otp-0 duoc gui ${otp0} lan; so lan ghi gia: ${ports.catalog.priceWrites} (= 20 lo x 50 san pham, khong ghi lai lo b0)`);

  say('3. Su co un tac: day 400 lo cap nhat gia (hang doi bulk chi xu ly 20 lo/giay)');
  for (let i = 100; i < 500; i++) await bulk(i);
  await sleep(3_000);
  await printDashboard();

  say('4. Su co nha mang SMS: 70% loi -> ti le that bai hang doi critical tang');
  ports.sms.failRate = 0.7;
  for (let i = 100; i < 160; i++) await otp(i);
  await sleep(4_000);
  await printDashboard();

  say('5. Su co ERP: dong bo ton kho dinh ky that bai lien tuc (bai hoc "chet 3 ngay ma khong ai biet")');
  ports.erp.down = true;
  await sleep(8_000);
  await printDashboard();

  say('6. Mat worker hang doi heavy (tien trinh bi tat) trong khi van co bao cao moi');
  await center.stopWorker('heavy');
  for (let i = 3; i <= 5; i++) await center.enqueue('export-report', { reportId: `${ns}-r${i}`, month: '2026-10' });
  await sleep(2_500);
  await printDashboard();

  say('7. Ngoai le: job du lieu hong va job khong ro loai - danh dau that bai, khong thu lai, khong sap');
  await center.queues.heavy.add('export-report', { reportId: 'x', month: 'thang-muoi' });
  await center.queues.bulk.add('xoa-toan-bo-du-lieu', {});
  await center.queues.bulk.add('bulk-price-update', { batchId: 'hong', items: [{ sku: 'A', price: -5 }] });

  say('8. Khoi phuc: nha mang SMS va ERP hoat dong lai, bat lai worker heavy');
  ports.sms.failRate = 0;
  ports.erp.down = false;
  center.startWorker('heavy');
  for (let t = 0; t < 60 && center.activeAlerts().length > 0; t++) await sleep(1_000);
  await printDashboard();

  say('Lich su canh bao');
  for (const e of system.history.events) {
    console.log(`${new Date(e.at).toISOString().slice(11, 19)} ${e.status.padEnd(8)} ${e.type.padEnd(14)} ${e.message}`);
  }
  logger.info(`Trang HTML bang dieu khien (ban chup cuoi): ${(await (await fetch(`http://localhost:${PORT}/`)).text()).length} byte`);

  await center.obliterate();
  await system.shutdown();
  process.exit(0);
}

main().catch((err) => {
  logger.error(String(err?.stack ?? err));
  process.exit(1);
});

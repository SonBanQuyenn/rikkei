/**
 * Chay thu co che tat an toan voi tien trinh worker that va tin hieu that.
 *   npm run demo   (can Redis; tren Windows chay trong container Linux de co SIGTERM that, xem bao-cao.md)
 */
import { readdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { counts, invoiceQueue, log, startWorker, waitUntil } from './worker-process.js';

const fastStall = { LOCK_DURATION_MS: '3000', STALLED_INTERVAL_MS: '1500', LOCK_RENEW_MS: '1000' };

async function scenario(title: string, run: (env: Record<string, string>) => Promise<void>) {
  const prefix = `demo-${randomUUID().slice(0, 8)}`;
  const storage = `.data/${prefix}`;
  console.log(`\n========== ${title} ==========`);
  await run({ BULL_PREFIX: prefix, STORAGE_DIR: storage });
  const files = await readdir(storage).catch(() => []);
  log('demo', `Tep PDF da luu: ${files.length} -> ${files.sort().join(', ')}`);
  const q = invoiceQueue(prefix);
  await q.obliterate({ force: true });
  await q.close();
  await rm(storage, { recursive: true, force: true });
}

async function main() {
  // ---------------------------------------------------------------------------------------------
  await scenario('1. SIGTERM khi dang co 5 job chay do', async (env) => {
    const q = invoiceQueue(env.BULL_PREFIX);
    const w1 = startWorker('worker-1', { ...env, PORT: '3201', SHUTDOWN_GRACE_MS: '20000' });
    await w1.ready;
    for (let i = 1; i <= 5; i++) await q.add('export', { invoiceId: `INV-00${i}` }, { jobId: `INV-00${i}` });
    await waitUntil(async () => (await counts(q)).active === 5);
    log('demo', `Dang chay: ${JSON.stringify(await counts(q))} -> gui SIGTERM`);
    w1.child.kill('SIGTERM');
    const exit = await w1.exited;
    log('demo', `worker-1 da thoat (code=${exit.code}, signal=${exit.signal})`);
    log('demo', `Trang thai hang doi sau khi thoat: ${JSON.stringify(await counts(q))}`);
    await q.close();
  });

  // ---------------------------------------------------------------------------------------------
  await scenario('2. Bay: job chay lau hon thoi gian cho tat (grace 2s, job 6s)', async (env) => {
    const q = invoiceQueue(env.BULL_PREFIX);
    const w1 = startWorker('worker-1', { ...env, ...fastStall, PORT: '3202', SHUTDOWN_GRACE_MS: '2000' });
    await w1.ready;
    await q.add('export', { invoiceId: 'INV-LONG', renderMs: 6000 }, { jobId: 'INV-LONG' });
    await waitUntil(async () => (await counts(q)).active === 1);
    log('demo', 'Gui SIGTERM khi INV-LONG moi chay');
    w1.child.kill('SIGTERM');
    const exit = await w1.exited;
    log('demo', `worker-1 da thoat (code=${exit.code}, signal=${exit.signal}), khong treo`);
    log('demo', `Trang thai ngay sau khi thoat: ${JSON.stringify(await counts(q))}`);
    const w2 = startWorker('worker-2', { ...env, ...fastStall, PORT: '3203' });
    await w2.ready;
    await waitUntil(async () => (await counts(q)).completed === 1);
    log('demo', `Sau khi worker-2 nhan lai: ${JSON.stringify(await counts(q))}`);
    w2.child.kill('SIGTERM');
    await w2.exited;
    await q.close();
  });

  // ---------------------------------------------------------------------------------------------
  await scenario('3. Bay: tien trinh bi giet ngay (SIGKILL) khi 5 job dang chay', async (env) => {
    const q = invoiceQueue(env.BULL_PREFIX);
    const w1 = startWorker('worker-1', { ...env, ...fastStall, PORT: '3204' });
    await w1.ready;
    for (let i = 1; i <= 5; i++) await q.add('export', { invoiceId: `INV-10${i}` }, { jobId: `INV-10${i}` });
    await waitUntil(async () => (await counts(q)).active === 5);
    log('demo', 'Gui SIGKILL (khong kip don dep)');
    w1.child.kill('SIGKILL');
    const exit = await w1.exited;
    log('demo', `worker-1 bi giet (signal=${exit.signal}); hang doi: ${JSON.stringify(await counts(q))}`);
    const w2 = startWorker('worker-2', { ...env, ...fastStall, PORT: '3205' });
    await w2.ready;
    await waitUntil(async () => (await counts(q)).completed === 5);
    log('demo', `Sau khi worker-2 nhan lai: ${JSON.stringify(await counts(q))}`);
    w2.child.kill('SIGTERM');
    await w2.exited;
    await q.close();
  });
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);

import 'reflect-metadata';
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, rm } from 'node:fs/promises';

// Cau hinh phai dat truoc khi nap module (tuy chon @Processor duoc doc luc import).
const prefix = `test-${randomUUID().slice(0, 8)}`;
const storageDir = `.data/${prefix}`;
Object.assign(process.env, {
  BULL_PREFIX: prefix,
  STORAGE_DIR: storageDir,
  SHUTDOWN_GRACE_MS: '2000',
  LOCK_DURATION_MS: '2000',
  STALLED_INTERVAL_MS: '1000',
  LOCK_RENEW_MS: '500',
});

const { NestFactory } = await import('@nestjs/core');
const { AppModule } = await import('../src/app.module.js');
const { counts, invoiceQueue, startWorker, waitUntil } = await import('../src/demo/worker-process.js');

const queue = invoiceQueue(prefix);
after(async () => {
  await queue.obliterate({ force: true });
  await queue.close();
  await rm(storageDir, { recursive: true, force: true });
});

async function startApp() {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.init();
  return app;
}

const files = async () => (await readdir(storageDir).catch(() => [] as string[])).sort();

test('Tat khi 5 job dang chay: ca 5 job hoan tat va PDF duoc luu truoc khi tien trinh thoat', async () => {
  const app = await startApp();
  const ids = Array.from({ length: 5 }, (_, i) => `A-${i + 1}`);
  for (const id of ids) await queue.add('export', { invoiceId: id }, { jobId: id });
  await waitUntil(async () => (await counts(queue)).active === 5);

  const t = Date.now();
  await app.close(); // chinh la viec Nest lam khi nhan SIGTERM (enableShutdownHooks)
  const tookMs = Date.now() - t;

  const c = await counts(queue);
  assert.equal(c.completed, 5);
  assert.equal(c.active, 0);
  assert.deepEqual((await files()).filter((f) => f.startsWith('A-')), ids.map((id) => `${id}.pdf`));
  assert.ok(tookMs >= 1000 && tookMs < 2000, `thoi gian tat ${tookMs} ms`);
});

test('Bay 1: job lau hon thoi gian cho - tien trinh van thoat dung han, job duoc worker khac nhan lai', async () => {
  const app1 = await startApp();
  await queue.add('export', { invoiceId: 'B-LONG', renderMs: 4000 }, { jobId: 'B-LONG' });
  await waitUntil(async () => (await counts(queue)).active === 1);

  const t = Date.now();
  await app1.close();
  const tookMs = Date.now() - t;
  assert.ok(tookMs >= 2000 && tookMs < 3000, `khong treo: tat sau ${tookMs} ms`);
  assert.equal((await counts(queue)).active, 1, 'job chua xong van nam o active, khong bi mat');

  const app2 = await startApp(); // tien trinh moi sau deploy
  await waitUntil(async () => (await counts(queue)).completed === 6, 30_000);
  const job = await queue.getJob('B-LONG');
  assert.equal(job?.attemptsStarted, 2, 'job duoc chay lai lan 2 tren tien trinh moi');
  assert.ok((await files()).includes('B-LONG.pdf'));
  await app2.close();
});

test('Bay 2: tien trinh bi giet ngay (SIGKILL) - 5 job dang do duoc tien trinh khac nhan lai', async () => {
  const env = { BULL_PREFIX: prefix, STORAGE_DIR: storageDir, PORT: '3301' };
  const w1 = startWorker('worker-1', env);
  await w1.ready;
  const ids = Array.from({ length: 5 }, (_, i) => `C-${i + 1}`);
  for (const id of ids) await queue.add('export', { invoiceId: id }, { jobId: id });
  await waitUntil(async () => (await counts(queue)).active === 5);

  w1.child.kill('SIGKILL');
  await w1.exited;
  assert.equal((await counts(queue)).active, 5, 'job dang do van nam o active');

  const w2 = startWorker('worker-2', { ...env, PORT: '3302' });
  await w2.ready;
  await waitUntil(async () => (await counts(queue)).completed === 11, 30_000);
  for (const id of ids) assert.equal((await queue.getJob(id))?.attemptsStarted, 2);
  const saved = await files();
  assert.ok(ids.every((id) => saved.includes(`${id}.pdf`)));
  w2.child.kill('SIGKILL');
  await w2.exited;
});

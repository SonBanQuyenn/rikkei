import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { Queue } from 'bullmq';
import { redisConnection } from '../config/redis.config.js';
import { INVOICE_QUEUE } from '../config/queue.config.js';

const MAIN = fileURLToPath(new URL('../main.js', import.meta.url));
const t0 = Date.now();

export const log = (who: string, msg: string) =>
  console.log(`${`+${((Date.now() - t0) / 1000).toFixed(2)}s`.padStart(9)} [${who}] ${msg}`);

/** Chay mot tien trinh worker that (node dist/src/main.js) va chuyen log cua no ra ngoai. */
export function startWorker(label: string, env: Record<string, string>) {
  const child = spawn(process.execPath, [MAIN], {
    env: { ...process.env, NO_COLOR: '1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let onReady!: () => void;
  const ready = new Promise<void>((r) => (onReady = r));
  for (const stream of [child.stdout, child.stderr]) {
    createInterface({ input: stream }).on('line', (line) => {
      const clean = line.replace(/^\[Nest\]\s+\d+\s+-\s+[\d/,: APM]+\s+/, '').trim();
      if (/RoutesResolver|RouterExplorer|InstanceLoader|NestFactory|NestApplication/.test(clean)) return;
      log(label, clean);
      if (clean.includes('Worker san sang')) onReady();
    });
  }
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) =>
    child.on('exit', (code, signal) => resolve({ code, signal })),
  );
  return { child, ready, exited };
}

export function invoiceQueue(prefix: string) {
  return new Queue(INVOICE_QUEUE, { connection: redisConnection, prefix });
}

export async function waitUntil(cond: () => Promise<boolean>, timeoutMs = 60_000) {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitUntil timeout');
    await new Promise((r) => setTimeout(r, 50));
  }
}

export async function counts(queue: Queue) {
  return queue.getJobCounts('wait', 'active', 'completed', 'failed', 'delayed');
}

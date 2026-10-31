import { Worker, type ConnectionOptions, type Job, type JobsOptions } from 'bullmq';
import type { Redis } from 'ioredis';
import { TRANSACTIONAL_QUEUE } from '../config/email.config.js';
import type { EmailProvider } from '../provider/email-provider.js';
import type { ProviderRateLimiter } from '../rate-limit/provider-rate-limiter.js';

export type TransactionalJob = { to: string; subject: string; html: string; idempotencyKey: string };

export const transactionalJobOptions = (idempotencyKey: string): JobsOptions => ({
  jobId: idempotencyKey,
  attempts: 5,
  backoff: { type: 'exponential', delay: 1_000 },
  removeOnComplete: true,
  removeOnFail: { age: 7 * 24 * 3600 },
});

export const LATENCY_KEY = 'metrics:transactional:latency-ms';

/**
 * Email giao dich (xac nhan don, OTP...): hang doi rieng, khong bi xep sau 500.000 email chien dich,
 * duoc uu tien trong bo gioi han dung chung (tran 95/s, chien dich chi duoc 80/s).
 */
export function createTransactionalWorker(deps: {
  connection: ConnectionOptions;
  prefix?: string;
  redis: Redis;
  provider: EmailProvider;
  limiter: ProviderRateLimiter;
  concurrency: number;
}) {
  const worker = new Worker<TransactionalJob>(
    TRANSACTIONAL_QUEUE,
    async (job: Job<TransactionalJob>) => {
      await deps.limiter.acquire('transactional');
      await deps.provider.send({ ...job.data, kind: 'transactional' });
      const latency = Date.now() - job.timestamp; // tu luc dat vao hang doi toi luc nha cung cap nhan
      await deps.redis.multi().lpush(LATENCY_KEY, latency).ltrim(LATENCY_KEY, 0, 9_999).exec();
      return { latency };
    },
    { connection: deps.connection, prefix: deps.prefix, concurrency: deps.concurrency },
  );
  worker.on('error', (err) => console.error(`[transactional-worker] ${err.message}`));
  return worker;
}

/**
 * Mot tien trinh xu ly (chay toi da 4 ban song song): worker chien dich + worker giao dich.
 *   PROVIDER_URL=http://... node dist/src/main.js
 */
import { Redis } from 'ioredis';
import { redisConnection } from './config/redis.config.js';
import { CAMPAIGN_CONCURRENCY_PER_PROCESS, TRANSACTIONAL_CONCURRENCY_PER_PROCESS } from './config/email.config.js';
import { HttpEmailProvider } from './provider/email-provider.js';
import { ProviderRateLimiter } from './rate-limit/provider-rate-limiter.js';
import { createCampaignWorker } from './campaign/campaign.worker.js';
import { createTransactionalWorker } from './transactional/transactional.worker.js';

const redis = new Redis(redisConnection);
const prefix = process.env.BULL_PREFIX ?? 'bull';
const provider = new HttpEmailProvider(process.env.PROVIDER_URL ?? 'http://127.0.0.1:4000');
const limiter = new ProviderRateLimiter(redis, process.env.LIMITER_KEY ?? 'email-provider:calls');
const shared = { connection: redisConnection, prefix, redis, provider, limiter };

const campaign = createCampaignWorker({ ...shared, concurrency: CAMPAIGN_CONCURRENCY_PER_PROCESS });
const transactional = createTransactionalWorker({ ...shared, concurrency: TRANSACTIONAL_CONCURRENCY_PER_PROCESS });
console.log(`[worker ${process.pid}] san sang`);

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  console.log(`[worker ${process.pid}] nhan ${signal}, dong worker`);
  await Promise.allSettled([campaign.close(), transactional.close()]);
  await redis.quit();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('message', (m) => m === 'shutdown' && void shutdown('message'));

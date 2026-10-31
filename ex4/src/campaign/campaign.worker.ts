import { Queue, RateLimitError, UnrecoverableError, Worker, type ConnectionOptions, type Job } from 'bullmq';
import type { Redis } from 'ioredis';
import { CAMPAIGN_CAP_PER_SEC, CAMPAIGN_QUEUE, RATE_WINDOW_MS } from '../config/email.config.js';
import { InvalidRecipientError, ProviderBlockedError, type EmailProvider } from '../provider/email-provider.js';
import type { ProviderRateLimiter } from '../rate-limit/provider-rate-limiter.js';
import type { CampaignJob } from './campaign.loader.js';
import { CampaignStats } from './campaign.stats.js';

const SENT_TTL_SEC = 30 * 24 * 3600;
export const sentMarkerKey = (campaignId: string, email: string) => `campaign:${campaignId}:sent:${email}`;

export type CampaignWorkerDeps = {
  connection: ConnectionOptions;
  prefix?: string;
  redis: Redis;
  provider: EmailProvider;
  limiter: ProviderRateLimiter;
  concurrency: number;
};

function render(job: CampaignJob) {
  return {
    subject: `${job.name} oi, ShopFast tang ban ma giam 50%`,
    html: `<p>Chao ${job.name},</p><p>Ma uu dai rieng cua ban: SF-${job.customerId.slice(-6).toUpperCase()}</p>`,
  };
}

/** Worker chien dich - moi tien trinh tao mot cai; gioi han toc do la toan cuc (Redis), khong theo tien trinh. */
export function createCampaignWorker(deps: CampaignWorkerDeps) {
  const queue = new Queue<CampaignJob>(CAMPAIGN_QUEUE, { connection: deps.connection, prefix: deps.prefix });

  const process = async (job: Job<CampaignJob>) => {
    const data = job.data;
    const stats = new CampaignStats(deps.redis, data.campaignId);

    if ((await stats.state()) === 'cancelled') {
      await stats.incr('cancelled');
      return { skipped: 'cancelled' };
    }
    // Chong gui trung: job chay lai (thu lai, tien trinh chet, nap lai danh sach) ma email da di -> bo qua.
    const marker = sentMarkerKey(data.campaignId, data.email);
    if (await deps.redis.exists(marker)) {
      await stats.incr('alreadySent');
      return { skipped: 'already-sent' };
    }

    await deps.limiter.acquire('campaign'); // cho suat trong cua so 1 giay dung chung
    try {
      await deps.provider.send({
        ...render(data),
        to: data.email,
        idempotencyKey: `${data.campaignId}-${data.email}`,
        kind: 'campaign',
      });
    } catch (err) {
      if (err instanceof InvalidRecipientError) {
        await stats.incr('invalidRecipient');
        throw new UnrecoverableError(err.message); // khong thu lai: ton phi ma vo ich
      }
      if (err instanceof ProviderBlockedError) {
        await queue.rateLimit(err.retryAfterMs); // ca hang doi chien dich cho het thoi gian bi chan
        throw new RateLimitError();
      }
      throw err; // loi tam thoi -> thu lai theo backoff
    }
    await deps.redis.set(marker, '1', 'EX', SENT_TTL_SEC);
    await stats.incr('sent');
    return { sent: true };
  };

  const worker = new Worker<CampaignJob>(CAMPAIGN_QUEUE, process, {
    connection: deps.connection,
    prefix: deps.prefix,
    concurrency: deps.concurrency,
    // Lop chan tho cua BullMQ (toan cuc theo hang doi); lop chinh xac la ProviderRateLimiter.
    limiter: { max: CAMPAIGN_CAP_PER_SEC, duration: RATE_WINDOW_MS },
  });

  worker.on('failed', (job, err) => {
    if (!job || err instanceof UnrecoverableError || err.name === 'RateLimitError') return;
    if (job.attemptsMade >= (job.opts.attempts ?? 1)) void new CampaignStats(deps.redis, job.data.campaignId).incr('failed');
  });
  worker.on('error', (err) => console.error(`[campaign-worker] ${err.message}`));

  return {
    worker,
    async close() {
      await worker.close();
      await queue.close();
    },
  };
}

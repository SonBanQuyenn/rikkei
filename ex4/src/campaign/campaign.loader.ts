import type { JobsOptions, Queue } from 'bullmq';
import { CAMPAIGN_ATTEMPTS, CAMPAIGN_BACKOFF_MS } from '../config/email.config.js';
import type { CampaignStats } from './campaign.stats.js';

export type Recipient = { customerId: string; email: string; name: string };
export type CampaignJob = { campaignId: string; customerId: string; email: string; name: string };

/** Dinh dang email hop le toi thieu: local@domain.tld, khong khoang trang, mot ky tu @. */
const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/;
export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export const isValidEmail = (email: string) => EMAIL_RE.test(email);

export function campaignJobOptions(campaignId: string, email: string, backoffMs = CAMPAIGN_BACKOFF_MS): JobsOptions {
  return {
    jobId: `${campaignId}-${email}`, // nap lai danh sach (vd. tien trinh nap bi chet giua chung) khong tao job trung
    attempts: CAMPAIGN_ATTEMPTS,
    backoff: { type: 'exponential', delay: backoffMs },
    removeOnComplete: true, // 500.000 job xong khong nam lai trong Redis
    removeOnFail: { age: 7 * 24 * 3600 },
  };
}

/**
 * Nap danh sach vao hang doi theo lo 1.000 job (addBulk):
 *  - loai email sai dinh dang (~3%) ngay tai day -> khong ton luot goi/phi cua nha cung cap;
 *  - loai trung theo khach hang VA theo dia chi email -> moi nguoi dung mot email.
 */
export async function loadCampaign(
  queue: Queue<CampaignJob>,
  stats: CampaignStats,
  recipients: Iterable<Recipient>,
  opts: { batchSize?: number; backoffMs?: number } = {},
) {
  const batchSize = opts.batchSize ?? 1000;
  const seenCustomers = new Set<string>();
  const seenEmails = new Set<string>();
  const counts = { total: 0, queued: 0, invalidFormat: 0, duplicates: 0 };
  let batch: { name: string; data: CampaignJob; opts: JobsOptions }[] = [];

  const flush = async () => {
    if (batch.length) await queue.addBulk(batch);
    batch = [];
  };

  for (const r of recipients) {
    counts.total++;
    const email = normalizeEmail(r.email);
    if (!isValidEmail(email)) {
      counts.invalidFormat++;
      continue;
    }
    if (seenCustomers.has(r.customerId) || seenEmails.has(email)) {
      counts.duplicates++;
      continue;
    }
    seenCustomers.add(r.customerId);
    seenEmails.add(email);
    counts.queued++;
    batch.push({
      name: 'send',
      data: { campaignId: stats.campaignId, customerId: r.customerId, email, name: r.name },
      opts: campaignJobOptions(stats.campaignId, email, opts.backoffMs),
    });
    if (batch.length >= batchSize) await flush();
  }
  await flush();
  await stats.setLoaded(counts);
  return counts;
}

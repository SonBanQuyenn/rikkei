import type { JobsOptions } from 'bullmq';

const DAY_SEC = 24 * 3600;

/**
 * Tuy chon job gui email xac nhan.
 * - jobId co dinh theo don: add() lap lai cho cung don khong tao job thu hai.
 * - backoff luy thua: cho 1s, 2s, 4s, 8s giua cac lan thu thay vi thu don dap ngay lap tuc.
 * - removeOnComplete: job xong bi xoa ngay khoi Redis; job loi chi giu 7 ngay / toi da 1000 ban de dieu tra.
 */
export function confirmationJobOptions(orderId: string, backoffDelayMs = 1000): JobsOptions {
  return {
    jobId: `order-confirmation-${orderId}`,
    attempts: 5,
    backoff: { type: 'exponential', delay: backoffDelayMs },
    removeOnComplete: true,
    removeOnFail: { age: 7 * DAY_SEC, count: 1000 },
  };
}

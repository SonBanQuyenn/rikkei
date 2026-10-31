import type { JobsOptions, WorkerOptions } from 'bullmq';
import type { StepName } from '../domain/order.js';

const HOUR = 3600;

/** Moi buoc mot hang doi rieng: cau hinh thu lai / song song doc lap, ung tac buoc nao thay ngay buoc do. */
export const queueName = (step: StepName) => `order-${step}`;

/** So lan thu va thoi gian cho goc (backoff luy thua) cua tung buoc. */
export const STEP_RETRY: Record<StepName, { attempts: number; backoffMs: number }> = {
  'reserve-stock': { attempts: 3, backoffMs: 1_000 }, //  loi ha tang kho: thu lai ngan; het hang: khong thu
  'confirm-payment': { attempts: 4, backoffMs: 2_000 }, // moi lan thu deu tra cuu truoc khi tru tien
  'issue-invoice': { attempts: 5, backoffMs: 2_000 }, //   yeu cau nghiep vu: toi da 5 lan roi bao ke toan
  'notify-customer': { attempts: 3, backoffMs: 1_000 }, // that bai khong anh huong don
  'push-shipping': { attempts: 6, backoffMs: 5_000 }, //   ~2,5 phut cho API doi tac hoi phuc
};

export function stepJobOptions(step: StepName, orderId: string, backoffOverrideMs?: number): JobsOptions {
  const { attempts, backoffMs } = STEP_RETRY[step];
  return {
    jobId: `${orderId}-${step}`, // moi don chi co mot job cho moi buoc, add() lap lai khong tao trung
    attempts,
    backoff: { type: 'exponential', delay: backoffOverrideMs ?? backoffMs },
    removeOnComplete: { age: 24 * HOUR },
    removeOnFail: { age: 30 * 24 * HOUR },
  };
}

export const WORKER_DEFAULTS: Omit<WorkerOptions, 'connection'> = {
  concurrency: 10,
  lockDuration: 30_000, //   tien trinh chet -> sau 30s job duoc tien trinh khac nhan lai
  stalledInterval: 30_000,
  maxStalledCount: 2,
};

/** Thoi gian cho toi da mot lan goi cong thanh toan. */
export const PAYMENT_TIMEOUT_MS = 10_000;

import type { WorkerOptions } from 'bullmq';

const num = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

export const INVOICE_QUEUE = 'invoice-export';

/** Tien to khoa Redis cua BullMQ - doi duoc de tach moi truong (test/demo). */
export const BULL_PREFIX = process.env.BULL_PREFIX ?? 'bull';

/**
 * (3) Thoi gian cho worker xu ly not viec dang chay khi tat (grace period).
 * Phai nho hon terminationGracePeriodSeconds cua ha tang (k8s mac dinh 30s), de con thoi gian don dep.
 */
export const SHUTDOWN_GRACE_MS = num('SHUTDOWN_GRACE_MS', 20_000);

/** Luoi an toan cuoi cung: qua moc nay tien trinh tu thoat, khong bao gio treo vinh vien. */
export const HARD_EXIT_MS = SHUTDOWN_GRACE_MS + num('HARD_EXIT_EXTRA_MS', 5_000);

export const invoiceWorkerOptions: Omit<WorkerOptions, 'connection'> = {
  concurrency: num('INVOICE_CONCURRENCY', 5),

  // (4) Khoang thoi gian coi mot job la bi bo roi:
  //  - lockDuration: worker phai gia han khoa trong khoang nay, het han ma khong gia han => job bi coi la bo roi.
  //  - stalledInterval: chu ky cac worker con song quet job bo roi va dua lai hang doi cho tien trinh khac.
  //  - maxStalledCount: mot job bi bo roi qua 2 lan thi chuyen sang failed (tranh job doc lam sap worker mai).
  lockDuration: num('LOCK_DURATION_MS', 30_000),
  stalledInterval: num('STALLED_INTERVAL_MS', 30_000),
  maxStalledCount: 2,

  // (5) Gia han khoa khi job chay lau hon nguong tren: worker tu dong gia han moi lockRenewTime
  //     (< lockDuration) cho moi job dang chay, nen job 2 phut van giu khoa du lockDuration chi 30s.
  lockRenewTime: num('LOCK_RENEW_MS', 10_000),
};

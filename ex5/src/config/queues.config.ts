import type { JobsOptions, WorkerOptions } from 'bullmq';

export const QUEUE_KEYS = ['critical', 'heavy', 'scheduled', 'bulk'] as const;
export type QueueKey = (typeof QUEUE_KEYS)[number];

export type AlertThresholds = {
  /** So job dang cho (wait + prioritized) vuot muc nay -> canh bao un tac. */
  maxWaiting: number;
  /** Job cho lau nhat vuot muc nay -> canh bao un tac (hang doi it job nhung khong ai xu ly). */
  maxWaitMs: number;
  /** Ti le lan chay that bai trong cua so theo doi vuot muc nay -> canh bao. */
  maxFailureRate: number;
  /** Chi tinh ti le khi co du so mau, tranh bao dong vi 1/2 lan loi. */
  minSamples: number;
};

export type QueueConfig = {
  name: string;
  purpose: string;
  worker: Pick<WorkerOptions, 'concurrency' | 'lockDuration' | 'limiter' | 'stalledInterval' | 'maxStalledCount'>;
  job: Pick<JobsOptions, 'attempts' | 'backoff' | 'removeOnComplete' | 'removeOnFail' | 'priority'>;
  alerts: AlertThresholds;
  /** Ly do chon cau hinh - hien tren bang dieu khien va bao cao. */
  rationale: string;
};

const MIN = 60_000;
const HOUR_SEC = 3600;

export const QUEUES: Record<QueueKey, QueueConfig> = {
  critical: {
    name: 'shopfast-critical',
    purpose: 'Viec gap: gui OTP dang nhap/thanh toan - khach dang cho tren man hinh',
    worker: { concurrency: 20, lockDuration: 30_000 },
    job: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 500 },
      removeOnComplete: { age: HOUR_SEC, count: 1_000 },
      removeOnFail: { age: 7 * 24 * HOUR_SEC },
    },
    alerts: { maxWaiting: 50, maxWaitMs: 10_000, maxFailureRate: 0.2, minSamples: 20 },
    rationale:
      'Viec ngan (~100 ms) va nhay do tre: song song cao, thu lai nhanh (0,5s -> 8s, OTP het han sau ~2 phut), ' +
      'khong gioi han toc do; nguong canh bao chat (OTP cho > 10s la khach bo cuoc).',
  },
  heavy: {
    name: 'shopfast-heavy',
    purpose: 'Viec nang chay lau: xuat bao cao doanh thu thang (vai phut, ton CPU/bo nho)',
    worker: { concurrency: 2, lockDuration: 5 * MIN, stalledInterval: MIN, maxStalledCount: 1 },
    job: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: { age: 7 * 24 * HOUR_SEC },
      removeOnFail: { age: 30 * 24 * HOUR_SEC },
    },
    alerts: { maxWaiting: 20, maxWaitMs: 15 * MIN, maxFailureRate: 0.34, minSamples: 3 },
    rationale:
      'Chi 2 viec song song de khong an het CPU/RAM cua may; khoa 5 phut (tu gia han) cho viec dai; ' +
      'thu lai thua (30s, 60s) vi loi thuong do CSDL qua tai; maxStalledCount 1: viec lam sap tien trinh khong duoc chay lai mai.',
  },
  scheduled: {
    name: 'shopfast-scheduled',
    purpose: 'Viec dinh ky: dong bo ton kho tu ERP moi 5 phut',
    worker: { concurrency: 1, lockDuration: 2 * MIN },
    job: {
      attempts: 3,
      backoff: { type: 'fixed', delay: 30_000 },
      removeOnComplete: { count: 200 },
      removeOnFail: { count: 500 },
    },
    alerts: { maxWaiting: 3, maxWaitMs: 5 * MIN, maxFailureRate: 0.5, minSamples: 2 },
    rationale:
      'concurrency 1: hai lan dong bo khong chay chong len nhau; thu lai co dinh 30s (ERP bao tri ngan); ' +
      'quan trong nhat la canh bao "lau khong chay thanh cong" (bai hoc job dong bo ton kho chet 3 ngay).',
  },
  bulk: {
    name: 'shopfast-bulk',
    purpose: 'Viec hang loat so luong lon: cap nhat gia hang loat theo lo 500 san pham',
    worker: { concurrency: 5, limiter: { max: 20, duration: 1_000 } },
    job: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { age: HOUR_SEC, count: 5_000 },
      removeOnFail: { age: 7 * 24 * HOUR_SEC },
      priority: 10,
    },
    alerts: { maxWaiting: 5_000, maxWaitMs: 30 * MIN, maxFailureRate: 0.1, minSamples: 50 },
    rationale:
      'Gioi han 20 lo/giay (~10.000 san pham/giay) de khong de CSDL; chiu duoc cho lau nen nguong backlog cao, ' +
      'nhung ti le loi > 10% la dau hieu du lieu nguon sai -> bao som.',
  },
};

/** Lich chay dinh ky. staleAfterMs: qua thoi gian nay khong co lan chay thanh cong -> canh bao. */
export type ScheduleConfig = { id: string; task: 'inventory-sync'; everyMs: number; staleAfterMs: number };
export const SCHEDULES: ScheduleConfig[] = [
  { id: 'inventory-sync', task: 'inventory-sync', everyMs: 5 * MIN, staleAfterMs: 15 * MIN },
];

export type MonitorConfig = {
  intervalMs: number;
  /** Cua so tinh ti le loi. */
  failureWindowMs: number;
  /** Canh bao con nguyen sau khoang nay thi nhac lai. */
  renotifyMs: number;
};
export const MONITOR: MonitorConfig = { intervalMs: 15_000, failureWindowMs: 5 * MIN, renotifyMs: 30 * MIN };

import type { QueueKey } from '../config/queues.config.js';

export type QueueSnapshot = {
  key: QueueKey;
  name: string;
  purpose: string;
  paused: boolean;
  workers: number;
  waiting: number; //   wait + prioritized
  active: number;
  delayed: number; //   cho thu lai / hen gio
  completed: number; // con luu trong hang doi
  failed: number; //    con luu trong hang doi (that bai sau moi lan thu)
  oldestWaitingMs: number | null;
  window: { completed: number; failed: number; deadLetter: number; failureRate: number; ms: number };
};

export type ScheduleSnapshot = {
  id: string;
  everyMs: number;
  staleAfterMs: number;
  lastSuccessAt: number | null;
  /** Tinh tu lan thanh cong gan nhat (hoac tu luc he thong khoi dong neu chua tung chay). */
  sinceSuccessMs: number;
};

export type DashboardSnapshot = { at: number; queues: QueueSnapshot[]; schedules: ScheduleSnapshot[] };

export type AlertType = 'BACKLOG' | 'SLOW_QUEUE' | 'FAILURE_RATE' | 'NO_WORKER' | 'STALE_SCHEDULE';

export type Alert = {
  id: string; //       type:doi tuong - dung de khu trung
  type: AlertType;
  target: string;
  severity: 'warning' | 'critical';
  message: string;
};

export type AlertEvent = Alert & { status: 'firing' | 'resolved' | 'reminder'; at: number };

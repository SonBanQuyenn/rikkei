import type { AlertThresholds, QueueKey } from '../config/queues.config.js';
import type { Alert, DashboardSnapshot } from './dashboard.types.js';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const sec = (ms: number) => `${Math.round(ms / 1000)}s`;

/**
 * Luat canh bao - ham thuan tuy: anh chup bang dieu khien + nguong -> danh sach canh bao dang dung.
 * Tach rieng de kiem thu va doi luat ma khong dung toi BullMQ.
 */
export function evaluateAlerts(snap: DashboardSnapshot, thresholds: Record<QueueKey, AlertThresholds>): Alert[] {
  const alerts: Alert[] = [];

  for (const q of snap.queues) {
    const t = thresholds[q.key];

    if (q.waiting > t.maxWaiting) {
      alerts.push({
        id: `BACKLOG:${q.key}`, type: 'BACKLOG', target: q.key,
        severity: q.waiting > 2 * t.maxWaiting ? 'critical' : 'warning',
        message: `Hang doi ${q.name} un tac: ${q.waiting} job dang cho (nguong ${t.maxWaiting})`,
      });
    }
    if (q.oldestWaitingMs !== null && q.oldestWaitingMs > t.maxWaitMs) {
      alerts.push({
        id: `SLOW_QUEUE:${q.key}`, type: 'SLOW_QUEUE', target: q.key, severity: 'warning',
        message: `Job cu nhat trong ${q.name} da cho ${sec(q.oldestWaitingMs)} (nguong ${sec(t.maxWaitMs)})`,
      });
    }
    const attempts = q.window.completed + q.window.failed;
    if (attempts >= t.minSamples && q.window.failureRate > t.maxFailureRate) {
      alerts.push({
        id: `FAILURE_RATE:${q.key}`, type: 'FAILURE_RATE', target: q.key,
        severity: q.window.failureRate > 2 * t.maxFailureRate ? 'critical' : 'warning',
        message:
          `Ti le that bai ${q.name} = ${pct(q.window.failureRate)} trong ${sec(q.window.ms)} gan nhat ` +
          `(${q.window.failed}/${attempts} lan chay, nguong ${pct(t.maxFailureRate)})`,
      });
    }
    if (!q.paused && q.workers === 0 && q.waiting + q.delayed > 0) {
      alerts.push({
        id: `NO_WORKER:${q.key}`, type: 'NO_WORKER', target: q.key, severity: 'critical',
        message: `Khong co worker nao dang xu ly ${q.name} trong khi con ${q.waiting + q.delayed} job`,
      });
    }
  }

  for (const s of snap.schedules) {
    if (s.sinceSuccessMs > s.staleAfterMs) {
      alerts.push({
        id: `STALE_SCHEDULE:${s.id}`, type: 'STALE_SCHEDULE', target: s.id, severity: 'critical',
        message: `Viec dinh ky "${s.id}" khong chay thanh cong ${sec(s.sinceSuccessMs)} (lich ${sec(s.everyMs)}, nguong ${sec(s.staleAfterMs)})`,
      });
    }
  }
  return alerts;
}

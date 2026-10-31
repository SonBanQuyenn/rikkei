import { errorMessage, type Logger } from '../common/logger.js';
import type { AlertThresholds, MonitorConfig, QueueKey } from '../config/queues.config.js';
import { evaluateAlerts } from './alert-rules.js';
import type { Alert, AlertEvent, DashboardSnapshot } from './dashboard.types.js';
import type { AlertNotifier } from './notifiers.js';

/**
 * Vong giam sat: dinh ky chup bang dieu khien, chay luat, so voi canh bao dang mo:
 *   moi xuat hien -> firing; het -> resolved; con nguyen qua renotifyMs -> reminder.
 * Moi loi trong vong lap deu duoc bat lai - giam sat khong bao gio lam sap tien trinh.
 */
export class AlertMonitor {
  private readonly open = new Map<string, { alert: Alert; since: number; lastNotified: number }>();
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly snapshot: () => Promise<DashboardSnapshot>,
    private readonly thresholds: Record<QueueKey, AlertThresholds>,
    private readonly cfg: MonitorConfig,
    private readonly notifiers: AlertNotifier[],
    private readonly logger: Logger,
  ) {}

  start() {
    this.timer = setInterval(() => void this.tick(), this.cfg.intervalMs);
    void this.tick();
  }

  stop() {
    clearInterval(this.timer);
  }

  activeAlerts() {
    return [...this.open.values()].map(({ alert, since }) => ({ ...alert, since }));
  }

  async tick() {
    if (this.running) return; // lan truoc chua xong (Redis cham) -> bo qua, khong chong lenh
    this.running = true;
    try {
      const now = Date.now();
      const current = evaluateAlerts(await this.snapshot(), this.thresholds);
      const currentIds = new Set(current.map((a) => a.id));

      for (const alert of current) {
        const prev = this.open.get(alert.id);
        if (!prev) {
          this.open.set(alert.id, { alert, since: now, lastNotified: now });
          await this.emit({ ...alert, status: 'firing', at: now });
        } else {
          prev.alert = alert;
          if (now - prev.lastNotified >= this.cfg.renotifyMs) {
            prev.lastNotified = now;
            await this.emit({ ...alert, status: 'reminder', at: now });
          }
        }
      }
      for (const [id, { alert }] of this.open) {
        if (currentIds.has(id)) continue;
        this.open.delete(id);
        await this.emit({ ...alert, status: 'resolved', at: now, message: `${alert.message} -> da tro lai binh thuong` });
      }
    } catch (err) {
      this.logger.error(`Vong giam sat loi (se thu lai o nhip sau): ${errorMessage(err)}`);
    } finally {
      this.running = false;
    }
  }

  private async emit(event: AlertEvent) {
    await Promise.all(
      this.notifiers.map((n) => n.notify(event).catch((err) => this.logger.warn(`Notifier loi: ${errorMessage(err)}`))),
    );
  }
}

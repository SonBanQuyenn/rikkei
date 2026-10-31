import { errorMessage, type Logger } from '../common/logger.js';
import type { AlertEvent } from './dashboard.types.js';

export interface AlertNotifier {
  notify(event: AlertEvent): Promise<void>;
}

/** Ghi ra log van hanh. */
export class LogNotifier implements AlertNotifier {
  constructor(private readonly logger: Logger) {}
  async notify(e: AlertEvent) {
    const tag = e.status === 'resolved' ? 'DA HET' : e.status === 'reminder' ? 'VAN CON' : e.severity.toUpperCase();
    const line = `[CANH BAO ${tag}] ${e.message}`;
    if (e.status === 'resolved') this.logger.info(line);
    else this.logger.warn(line);
  }
}

/** Gui webhook (Slack/Teams/PagerDuty...). Loi gui canh bao khong duoc lam sap he thong. */
export class WebhookNotifier implements AlertNotifier {
  constructor(
    private readonly url: string,
    private readonly logger: Logger,
  ) {}
  async notify(e: AlertEvent) {
    try {
      const res = await fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: `[${e.status}] ${e.message}`, alert: e }),
        signal: AbortSignal.timeout(3_000),
      });
      if (!res.ok) this.logger.warn(`Webhook canh bao tra ve ${res.status}`);
    } catch (err) {
      this.logger.warn(`Khong gui duoc webhook canh bao: ${errorMessage(err)}`);
    }
  }
}

/** Giu lai su kien trong bo nho - dung cho bang dieu khien va kiem thu. */
export class MemoryNotifier implements AlertNotifier {
  readonly events: AlertEvent[] = [];
  async notify(e: AlertEvent) {
    this.events.push(e);
    if (this.events.length > 200) this.events.shift();
  }
}

import { Inject, Injectable } from '@nestjs/common';
import { DASHBOARD_CONFIG, type DashboardConfig } from './config.js';

export interface StockAlert {
  sku: string;
  name: string;
  remaining: number;
  raisedAt: number;
}

export interface Snapshot {
  newOrders: number;
  revenue: number;
  alerts: StockAlert[];
  updatedAt: number;
}

export type DashboardEvent =
  | { id: number; type: 'metrics'; data: Omit<Snapshot, 'alerts'> }
  | { id: number; type: 'stock_alert'; data: StockAlert };

type Listener = (e: DashboardEvent) => void;

/** Nguon du lieu cua bang dieu khien: giu snapshot hien tai + bo dem su kien gan nhat. */
@Injectable()
export class MetricsService {
  /** Doi moi lan khoi dong: id cua lan chay truoc khong bi hieu nham la id hien tai. */
  readonly bootId = Date.now().toString(36);
  private seq = 0;
  private readonly buffer: DashboardEvent[] = [];
  private readonly listeners = new Set<Listener>();
  private readonly state: Snapshot = { newOrders: 0, revenue: 0, alerts: [], updatedAt: Date.now() };

  constructor(@Inject(DASHBOARD_CONFIG) private readonly config: DashboardConfig) {}

  get lastEventId() {
    return this.wireId(this.seq);
  }

  /** Id gui xuong trinh duyet trong truong `id:` cua SSE. */
  wireId(seq: number) {
    return `${this.bootId}.${seq}`;
  }

  get subscriberCount() {
    return this.listeners.size;
  }

  snapshot(): Snapshot {
    return { ...this.state, alerts: [...this.state.alerts] };
  }

  recordOrder(amount: number) {
    this.state.newOrders += 1;
    this.state.revenue += amount;
    this.state.updatedAt = Date.now();
    const { alerts, ...metrics } = this.state;
    this.publish({ id: ++this.seq, type: 'metrics', data: metrics });
  }

  /** Canh bao het hang duoc day ngay lap tuc toi moi man hinh. */
  raiseStockAlert(sku: string, name: string, remaining: number) {
    const alert: StockAlert = { sku, name, remaining, raisedAt: Date.now() };
    this.state.alerts = [alert, ...this.state.alerts.filter((a) => a.sku !== sku)].slice(0, 20);
    this.publish({ id: ++this.seq, type: 'stock_alert', data: alert });
  }

  /**
   * Cac su kien sau lastEventId. Tra null neu id da troi khoi bo dem, khong hop le
   * hoac thuoc lan chay server truoc -> client phai nhan lai snapshot day du.
   */
  since(lastEventId: string): DashboardEvent[] | null {
    const [boot, raw] = lastEventId.split('.');
    const lastId = Number(raw);
    if (boot !== this.bootId || !Number.isInteger(lastId) || lastId < 0 || lastId > this.seq) return null;
    if (lastId === this.seq) return [];
    const oldest = this.buffer[0]?.id ?? this.seq + 1;
    if (lastId + 1 < oldest) return null;
    return this.buffer.filter((e) => e.id > lastId);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private publish(e: DashboardEvent) {
    this.buffer.push(e);
    if (this.buffer.length > this.config.bufferSize) this.buffer.shift();
    for (const fn of this.listeners) fn(e);
  }
}

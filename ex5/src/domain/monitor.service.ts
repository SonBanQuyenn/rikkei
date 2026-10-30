import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DISPATCH_CONFIG, type DispatchConfig } from '../config.js';
import { DispatchService } from './dispatch.service.js';
import { DriverService } from './driver.service.js';
import { OrderService } from './order.service.js';

/** Quet dinh ky de phat hien don dang tac va tai xe "im lang". */
@Injectable()
export class MonitorService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  /** `${loai}:${orderId}` -> moc thoi gian da canh bao: moi tinh huong chi bao 1 lan. */
  private readonly alerted = new Map<string, number>();
  private readonly logger = new Logger(MonitorService.name);

  constructor(
    private readonly orders: OrderService,
    private readonly drivers: DriverService,
    private readonly dispatch: DispatchService,
    @Inject(DISPATCH_CONFIG) private readonly config: DispatchConfig,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => this.safeTick(), this.config.monitorIntervalMs);
  }

  onModuleDestroy() {
    clearInterval(this.timer);
  }

  private safeTick() {
    try {
      this.tick();
    } catch (err) {
      this.logger.error(err); // loi trong mot lan quet khong duoc lam dung bo giam sat
    }
  }

  tick(now = Date.now()) {
    for (const order of this.orders.list()) {
      if (order.status === 'delivered') {
        this.alerted.delete(`stuck:${order.id}`);
        this.alerted.delete(`silent:${order.id}`);
        continue;
      }
      const age = now - order.statusSince;

      if (order.status === 'pending' && age > this.config.pendingLimitMs) {
        this.once(`stuck:${order.id}`, order.statusSince, () =>
          this.dispatch.alert('ORDER_STUCK', `Don ${order.id} cho gan tai xe qua ${Math.round(age / 1000)}s`, order.id, null),
        );
      }

      if (order.status === 'offered' && age > this.config.offerTimeoutMs) {
        const name = this.drivers.get(order.driverId!).name;
        this.dispatch.release(order, 'OFFER_TIMEOUT', `${name} khong phan hoi don ${order.id}, don da ve hang cho`);
      }

      if ((order.status === 'accepted' || order.status === 'picked_up') && order.driverId) {
        const driver = this.drivers.get(order.driverId);
        const lastSeen = Math.max(driver.lastSeenAt ?? 0, order.statusSince);
        if (now - lastSeen > this.config.silentLimitMs) {
          this.once(`silent:${order.id}`, lastSeen, () =>
            this.dispatch.alert(
              'DRIVER_SILENT',
              `${driver.name} khong cap nhat vi tri/tien do don ${order.id} qua ${Math.round((now - lastSeen) / 1000)}s`,
              order.id,
              driver.id,
            ),
          );
        }
      }
    }
  }

  private once(key: string, mark: number, fn: () => void) {
    if (this.alerted.get(key) === mark) return;
    this.alerted.set(key, mark);
    fn();
  }
}

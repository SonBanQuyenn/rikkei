import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DASHBOARD_CONFIG, type DashboardConfig } from './config.js';
import { MetricsService } from './metrics.service.js';

const PRODUCTS = [
  { sku: 'SKU-001', name: 'Tai nghe Bluetooth' },
  { sku: 'SKU-002', name: 'Sac du phong 10000mAh' },
  { sku: 'SKU-003', name: 'Op lung iPhone' },
];

/** Gia lap he thong don hang: gio cao diem ~5s/lan, ban dem ~2 phut/lan. */
@Injectable()
export class SimulatorService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private readonly logger = new Logger(SimulatorService.name);

  constructor(
    private readonly metrics: MetricsService,
    @Inject(DASHBOARD_CONFIG) private readonly config: DashboardConfig,
  ) {}

  onModuleInit() {
    if (this.config.simulate) this.schedule();
  }

  onModuleDestroy() {
    clearTimeout(this.timer);
  }

  private schedule() {
    const hour = new Date().getHours();
    const night = hour >= 23 || hour < 6;
    const delay = night ? 120_000 : 5_000;
    this.timer = setTimeout(() => {
      this.metrics.recordOrder(Math.round(50_000 + Math.random() * 950_000));
      if (Math.random() < 0.15) {
        const p = PRODUCTS[Math.floor(Math.random() * PRODUCTS.length)];
        this.metrics.raiseStockAlert(p.sku, p.name, Math.floor(Math.random() * 3));
        this.logger.warn(`Canh bao het hang ${p.sku}`);
      }
      this.schedule();
    }, delay);
  }
}

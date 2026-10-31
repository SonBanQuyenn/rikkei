import type { OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { InventoryDb } from '../db/inventory.db.js';

/**
 * Dong bo theo lo xuong dong products.stock: moi chu ky gom moi thay doi chua ap dung
 * thanh MOT lenh UPDATE -> dong nong chi nhan ~1 lan ghi/giay thay vi 400.
 */
export class StockSyncWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;

  constructor(
    private readonly db: InventoryDb,
    private readonly intervalMs = 1_000,
  ) {}

  onModuleInit() {
    this.start();
  }

  onModuleDestroy() {
    return this.stop();
  }

  start() {
    this.timer = setInterval(() => void this.flush(), this.intervalMs);
  }

  async stop() {
    clearInterval(this.timer);
    await this.running;
    await this.flush();
  }

  /** Khong chay chong hai lan flush. */
  flush(): Promise<void> {
    this.running ??= (async () => {
      try {
        for (const productId of this.db.products.keys()) await this.db.applyPendingChanges(productId);
      } finally {
        this.running = undefined;
      }
    })();
    return this.running;
  }
}

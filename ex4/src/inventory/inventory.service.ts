import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { BadRequestException, ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { InventoryDb } from '../db/inventory.db.js';
import { MISSING, OUT_OF_STOCK, type StockCache } from './stock-cache.js';

export const MAX_QTY_PER_ORDER = 5;
const REBUILD_LOCK_TTL_MS = 5_000;
const REBUILD_WAIT_MS = 20;
const MAX_REDIS_ATTEMPTS = 50;

export type PlacedOrder = { orderId: string; productId: string; qty: number; remaining: number };

/**
 * Chien luoc da chon: Redis lam "cong" tru kho nguyen tu + CSDL ghi don hang ngay (moi don mot dong),
 * dong products.stock duoc dong bo theo lo boi StockSyncWorker.
 */
export class InventoryService {
  constructor(
    private readonly db: InventoryDb,
    private readonly stock: StockCache,
  ) {}

  async placeOrder(productId: string, userId: string, qty: number): Promise<PlacedOrder> {
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY_PER_ORDER) {
      throw new BadRequestException(`So luong phai tu 1 den ${MAX_QTY_PER_ORDER}`);
    }
    if (!this.db.products.has(productId)) throw new NotFoundException(`Khong co san pham ${productId}`);

    // 1. Ghi don PENDING vao CSDL TRUOC: neu Redis mat du lieu, lan dung lai van thay don nay
    const order = await this.db.insertOrder(productId, userId, qty);

    // 2. Tru kho nguyen tu tren Redis
    let remaining: number;
    try {
      remaining = await this.withStockKey(productId, () => this.stock.reserve(productId, order.id, qty));
    } catch (err) {
      await this.reject(order.id, productId, qty);
      throw err;
    }
    if (remaining === OUT_OF_STOCK) {
      await this.reject(order.id, productId, qty);
      throw new ConflictException('San pham da het hang');
    }

    // 3. Xac nhan don
    await this.db.setOrderStatus(order.id, ['PENDING'], 'CONFIRMED');
    return { orderId: order.id, productId, qty, remaining };
  }

  /** Huy don giua chung: hoan so luong vao ton kho. Goi nhieu lan chi hoan mot lan. */
  async cancelOrder(orderId: string): Promise<{ orderId: string; status: 'CANCELLED' }> {
    const order = await this.db.getOrder(orderId);
    if (!order) throw new NotFoundException(`Khong co don ${orderId}`);
    if (order.status === 'CANCELLED') return { orderId, status: 'CANCELLED' };

    const changed = await this.db.setOrderStatus(orderId, ['CONFIRMED'], 'CANCELLED');
    if (!changed) {
      const now = await this.db.getOrder(orderId);
      if (now?.status === 'CANCELLED') return { orderId, status: 'CANCELLED' };
      throw new ConflictException(`Don dang o trang thai ${now?.status}, khong huy duoc`);
    }
    // CSDL da ghi CANCELLED -> dong products duoc cong lai o lan dong bo ke tiep; Redis cong lai ngay
    await this.withStockKey(order.productId, () => this.stock.release(order.productId, orderId, order.qty));
    return { orderId, status: 'CANCELLED' };
  }

  async available(productId: string): Promise<number> {
    const cached = await this.stock.available(productId);
    if (cached !== null) return cached;
    await this.rebuild(productId);
    return (await this.stock.available(productId)) ?? 0;
  }

  /**
   * Redis khoi dong lai -> khoa ton kho mat -> dung lai tu CSDL.
   * Chi mot instance dung lai (khoa phan tan), cac instance khac cho roi thu lai.
   */
  async rebuild(productId: string): Promise<void> {
    const token = randomUUID();
    if (!(await this.stock.tryLockRebuild(productId, token, REBUILD_LOCK_TTL_MS))) {
      await sleep(REBUILD_WAIT_MS);
      return;
    }
    try {
      const { available, heldOrderIds, provisionalOrderIds } = await this.db.snapshotForRebuild(productId);
      await this.stock.writeRebuild(productId, available, heldOrderIds, provisionalOrderIds);
    } finally {
      await this.stock.unlockRebuild(productId, token);
    }
  }

  private async reject(orderId: string, productId: string, qty: number) {
    await this.db.setOrderStatus(orderId, ['PENDING'], 'REJECTED');
    // Neu lan dung lai da tru tam don PENDING nay (hoac Redis da tru nhung loi mang mat phan hoi) -> tra lai
    await this.withStockKey(productId, () => this.stock.release(productId, orderId, qty)).catch(() => undefined);
  }

  /** Chay thao tac Redis; neu khoa ton kho mat thi dung lai tu CSDL roi thu lai (gioi han so lan). */
  private async withStockKey(productId: string, op: () => Promise<number>): Promise<number> {
    for (let attempt = 0; attempt < MAX_REDIS_ATTEMPTS; attempt++) {
      const result = await op();
      if (result !== MISSING) return result;
      await this.rebuild(productId);
    }
    throw new ServiceUnavailableException('Dang khoi phuc ton kho, vui long thu lai');
  }
}

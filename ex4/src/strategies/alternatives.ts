import { ConflictException } from '@nestjs/common';
import type { InventoryDb } from '../db/inventory.db.js';
import { OUT_OF_STOCK, type StockCache } from '../inventory/stock-cache.js';

/** Cac giai phap khong duoc chon - chi dung de do so sanh trong benchmark. */

/** (a) Ghi thang CSDL: UPDATE products SET stock = stock - qty WHERE stock >= qty, moi don mot lan ghi dong nong. */
export class DirectDbStrategy {
  constructor(private readonly db: InventoryDb) {}

  async placeOrder(productId: string, userId: string, qty: number) {
    if (!(await this.db.decrementStockRow(productId, qty))) throw new ConflictException('San pham da het hang');
    const order = await this.db.insertOrder(productId, userId, qty);
    await this.db.setOrderStatus(order.id, ['PENDING'], 'CONFIRMED');
    return order.id;
  }
}

/** (b) Ghi dong thoi: tru tren Redis roi ghi dong bo ngay xuong dong products trong cung request. */
export class WriteThroughStrategy {
  constructor(
    private readonly db: InventoryDb,
    private readonly stock: StockCache,
  ) {}

  async placeOrder(productId: string, userId: string, qty: number) {
    const order = await this.db.insertOrder(productId, userId, qty);
    if ((await this.stock.reserve(productId, order.id, qty)) === OUT_OF_STOCK) {
      await this.db.setOrderStatus(order.id, ['PENDING'], 'REJECTED');
      throw new ConflictException('San pham da het hang');
    }
    await this.db.decrementStockRow(productId, qty);
    await this.db.setOrderStatus(order.id, ['PENDING'], 'CONFIRMED');
    return order.id;
  }
}

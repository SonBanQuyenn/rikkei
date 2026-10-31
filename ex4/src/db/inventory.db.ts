import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'CANCELLED';

export type OrderRow = {
  id: string;
  productId: string;
  userId: string;
  qty: number;
  status: OrderStatus;
  /** Da tru vao dong products.stock chua */
  stockApplied: boolean;
  /** Don huy: da cong tra vao dong products.stock chua */
  restockApplied: boolean;
};

export type DbOptions = {
  /** Thoi gian mot cau lenh tren bang orders (moi dong mot ban ghi, khong tranh khoa nhau) */
  statementLatencyMs?: number;
  /** So lan ghi toi da moi giay tren CUNG mot dong products (khoa dong) */
  hotRowWritesPerSec?: number;
};

/**
 * Gia lap CSDL quan he:
 * - bang `products(id, stock)`: moi lenh UPDATE tren cung mot dong phai xep hang lay khoa dong,
 *   moi lenh giu khoa 1000/150 ms -> toi da ~150 lan ghi/giay tren mot dong;
 * - bang `orders`: INSERT/UPDATE tung dong rieng, chay song song.
 * Moi lenh duoc thuc thi nguyen tu (doan dong bo sau khi doi xong do tre).
 */
export class InventoryDb {
  readonly products = new Map<string, { id: string; stock: number }>();
  readonly orders = new Map<string, OrderRow>();
  hotRowWrites = 0;
  failNextInsert = 0;

  private readonly statementLatencyMs: number;
  private readonly hotRowHoldMs: number;
  private readonly rowBusyUntil = new Map<string, number>();

  constructor({ statementLatencyMs = 3, hotRowWritesPerSec = 150 }: DbOptions = {}) {
    this.statementLatencyMs = statementLatencyMs;
    this.hotRowHoldMs = 1000 / hotRowWritesPerSec;
  }

  seedProduct(id: string, stock: number) {
    this.products.set(id, { id, stock });
  }

  async getStock(productId: string): Promise<number> {
    await sleep(this.statementLatencyMs);
    return this.products.get(productId)?.stock ?? 0;
  }

  async getOrder(id: string): Promise<OrderRow | undefined> {
    await sleep(this.statementLatencyMs);
    const row = this.orders.get(id);
    return row && { ...row };
  }

  /** INSERT INTO orders ... (status PENDING) */
  async insertOrder(productId: string, userId: string, qty: number): Promise<OrderRow> {
    await sleep(this.statementLatencyMs);
    if (this.failNextInsert > 0) {
      this.failNextInsert--;
      throw new Error('DB: insert order failed');
    }
    const row: OrderRow = {
      id: randomUUID(), productId, userId, qty, status: 'PENDING', stockApplied: false, restockApplied: false,
    };
    this.orders.set(row.id, row);
    return { ...row };
  }

  /** UPDATE orders SET status = :to WHERE id = :id AND status IN (:from) -> true neu doi duoc */
  async setOrderStatus(id: string, from: OrderStatus[], to: OrderStatus): Promise<boolean> {
    await sleep(this.statementLatencyMs);
    const row = this.orders.get(id);
    if (!row || !from.includes(row.status)) return false;
    row.status = to;
    return true;
  }

  /** UPDATE products SET stock = stock - :qty WHERE id = :id AND stock >= :qty (giu khoa dong) */
  async decrementStockRow(productId: string, qty: number): Promise<boolean> {
    await this.lockHotRow(productId);
    const p = this.products.get(productId);
    if (!p || p.stock < qty) return false;
    p.stock -= qty;
    return true;
  }

  /**
   * Mot transaction dong bo theo lo:
   * cong don moi don CONFIRMED chua tru + moi don CANCELLED da tru nhung chua hoan,
   * cap nhat dong products MOT lan, danh dau cac don da ap dung.
   */
  async applyPendingChanges(productId: string): Promise<{ consumed: number; restocked: number }> {
    const rows = [...this.orders.values()].filter((o) => o.productId === productId);
    const hasWork = rows.some(
      (o) => (o.status === 'CONFIRMED' && !o.stockApplied) || (o.status === 'CANCELLED' && o.stockApplied && !o.restockApplied),
    );
    if (!hasWork) return { consumed: 0, restocked: 0 };

    await this.lockHotRow(productId);
    let consumed = 0;
    let restocked = 0;
    for (const o of this.orders.values()) {
      if (o.productId !== productId) continue;
      if (o.status === 'CONFIRMED' && !o.stockApplied) {
        consumed += o.qty;
        o.stockApplied = true;
      } else if (o.status === 'CANCELLED' && o.stockApplied && !o.restockApplied) {
        restocked += o.qty;
        o.restockApplied = true;
      }
    }
    this.products.get(productId)!.stock += restocked - consumed;
    return { consumed, restocked };
  }

  /**
   * Doc nhat quan de dung lai so ton kho kha dung trong Redis:
   * kha dung = stock trong CSDL - don PENDING/CONFIRMED chua tru + don CANCELLED da tru chua hoan.
   * Don PENDING chua biet ket qua (co the da duoc Redis cu cho qua) -> tru tam va dua vao danh sach "tam giu";
   * khi request cua don do toi Redis moi se duoc kiem tra lai.
   */
  async snapshotForRebuild(
    productId: string,
  ): Promise<{ available: number; heldOrderIds: string[]; provisionalOrderIds: string[] }> {
    await sleep(this.statementLatencyMs);
    let available = this.products.get(productId)?.stock ?? 0;
    const heldOrderIds: string[] = [];
    const provisionalOrderIds: string[] = [];
    for (const o of this.orders.values()) {
      if (o.productId !== productId) continue;
      if (o.status === 'PENDING') {
        provisionalOrderIds.push(o.id);
        available -= o.qty;
      } else if (o.status === 'CONFIRMED') {
        heldOrderIds.push(o.id);
        if (!o.stockApplied) available -= o.qty;
      } else if (o.status === 'CANCELLED' && o.stockApplied && !o.restockApplied) {
        available += o.qty;
      }
    }
    return { available, heldOrderIds, provisionalOrderIds };
  }

  /** Tong so luong cua cac don dang hieu luc (da ban that su) */
  soldQty(productId: string): number {
    let sum = 0;
    for (const o of this.orders.values()) if (o.productId === productId && o.status === 'CONFIRMED') sum += o.qty;
    return sum;
  }

  /** Xep hang lay khoa dong products: moi lenh giu khoa hotRowHoldMs. */
  private async lockHotRow(productId: string) {
    const now = performance.now();
    const start = Math.max(now, this.rowBusyUntil.get(productId) ?? 0);
    const end = start + this.hotRowHoldMs;
    this.rowBusyUntil.set(productId, end);
    this.hotRowWrites++;
    await sleep(end - now);
  }
}

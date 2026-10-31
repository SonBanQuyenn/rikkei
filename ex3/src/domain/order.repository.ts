import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { TERMINAL_STATUSES, type Order, type OrderItem, type OrderStatus, type StepName } from './order.js';

/**
 * Kho don hang (dong vai CSDL - nam ngoai tien trinh nen con nguyen khi tien trinh khoi dong lai).
 * Moi buoc chi ghi don cua chinh no va cac buoc cua mot don chay tuan tu -> khong tranh ghi.
 */
export class OrderRepository {
  constructor(
    private readonly redis: Redis,
    private readonly ns = 'shopfast',
  ) {}

  private key = (id: string) => `${this.ns}:order:${id}`;
  private activeSet = () => `${this.ns}:orders:in-progress`;

  async create(input: { customer: Order['customer']; items: OrderItem[]; amount: number }): Promise<Order> {
    const order: Order = {
      id: randomUUID(),
      ...input,
      status: 'PLACED',
      completedSteps: [],
      history: [{ at: new Date().toISOString(), status: 'PLACED', note: 'Khach dat hang thanh cong' }],
    };
    await this.redis.multi().set(this.key(order.id), JSON.stringify(order)).sadd(this.activeSet(), order.id).exec();
    return order;
  }

  async get(id: string): Promise<Order> {
    const raw = await this.redis.get(this.key(id));
    if (!raw) throw new Error(`Khong tim thay don ${id}`);
    return JSON.parse(raw) as Order;
  }

  /** Ghi ket qua mot phan (vd. da gui email nhung chua gui SMS) - khong doi trang thai. */
  async patch(id: string, patch: Partial<Order>) {
    const order = await this.get(id);
    await this.redis.set(this.key(id), JSON.stringify({ ...order, ...patch }));
  }

  /** Ghi ket qua cua mot buoc: trang thai moi + du lieu + danh dau buoc da xong + lich su. */
  async completeStep(id: string, step: StepName, status: OrderStatus, note: string, patch: Partial<Order> = {}) {
    const order = await this.get(id);
    if (order.completedSteps.includes(step)) return order;
    const next: Order = {
      ...order,
      ...patch,
      status,
      completedSteps: [...order.completedSteps, step],
      history: [...order.history, { at: new Date().toISOString(), status, note }],
    };
    const tx = this.redis.multi().set(this.key(id), JSON.stringify(next));
    if (TERMINAL_STATUSES.includes(status)) tx.srem(this.activeSet(), id);
    await tx.exec();
    return next;
  }

  /** Cac don chua ket thuc - dung khi khoi dong lai de noi tiep day chuyen. */
  async listInProgress(): Promise<Order[]> {
    const ids = await this.redis.smembers(this.activeSet());
    return Promise.all(ids.map((id) => this.get(id)));
  }

  async clear() {
    const keys = await this.redis.keys(`${this.ns}:*`);
    if (keys.length) await this.redis.del(...keys);
  }
}

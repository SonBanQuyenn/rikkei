import { Injectable } from '@nestjs/common';
import type { AuthUser, OrderStatus } from '../contracts/events.js';
import { DomainError, DomainEvents } from './domain-events.js';
import type { Order } from './models.js';

const MAX_ADDRESS = 200;

@Injectable()
export class OrderService {
  private readonly orders = new Map<string, Order>();
  private seq = 0;

  constructor(private readonly events: DomainEvents) {}

  place(customer: AuthUser, payload: unknown): Order {
    const { pickup, dropoff } = (payload ?? {}) as Record<string, unknown>;
    const now = Date.now();
    const order: Order = {
      id: `DH-${String(++this.seq).padStart(4, '0')}`,
      customerId: customer.id,
      customerName: customer.name,
      pickup: address(pickup, 'Diem lay hang'),
      dropoff: address(dropoff, 'Diem giao hang'),
      status: 'pending',
      driverId: null,
      createdAt: now,
      statusSince: now,
    };
    this.orders.set(order.id, order);
    this.events.emit('orderChanged', { order });
    return order;
  }

  get(id: unknown): Order {
    const order = typeof id === 'string' ? this.orders.get(id) : undefined;
    if (!order) throw new DomainError('Don hang khong ton tai');
    return order;
  }

  list(): Order[] {
    return [...this.orders.values()];
  }

  ofCustomer(customerId: string): Order[] {
    return this.list().filter((o) => o.customerId === customerId);
  }

  transition(order: Order, status: OrderStatus, driverId: string | null, revokedFrom?: { driverId: string; reason: string }) {
    order.status = status;
    order.driverId = driverId;
    order.statusSince = Date.now();
    this.events.emit('orderChanged', { order, revokedFrom });
  }
}

function address(v: unknown, label: string): string {
  if (typeof v !== 'string' || v.trim() === '') throw new DomainError(`${label} khong duoc de trong`);
  if (v.length > MAX_ADDRESS) throw new DomainError(`${label} qua dai (toi da ${MAX_ADDRESS} ky tu)`);
  return v.trim();
}

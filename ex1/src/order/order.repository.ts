import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

export type CreateOrderDto = { email: string; items: { sku: string; qty: number }[] };
export type Order = CreateOrderDto & { id: string; createdAt: Date };

/** Kho don hang gia lap CSDL. */
@Injectable()
export class OrderRepository {
  private readonly orders = new Map<string, Order>();

  async save(dto: CreateOrderDto): Promise<Order> {
    const order = { ...dto, id: randomUUID(), createdAt: new Date() };
    this.orders.set(order.id, order);
    return order;
  }
}

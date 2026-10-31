// order.service.ts (BAN GOC)
import type { Queue } from 'bullmq';
import { OrderRepository, type CreateOrderDto } from './order.repository.js';

export class BuggyOrderService {
  constructor(private repo: OrderRepository, private emailQueue: Queue) {}

  async createOrder(dto: CreateOrderDto) {
    const order = await this.repo.save(dto);
    await this.emailQueue.add("send-confirmation", {
      orderId: order.id,
      email: dto.email,
    }, {
      attempts: 5,
    });
    return order;
  }
}

import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { OrderRepository, type CreateOrderDto } from './order.repository.js';
import { confirmationJobOptions } from '../email/email-queue.options.js';
import { EMAIL_QUEUE, SEND_CONFIRMATION_JOB, type ConfirmationJobData } from '../email/email.constants.js';

/** Thoi gian cho goc cua backoff luy thua (ms) - cho phep thu nghiem ghi de. */
export const EMAIL_BACKOFF_MS = Symbol('EMAIL_BACKOFF_MS');

@Injectable()
export class OrderService {
  constructor(
    @Inject(OrderRepository) private readonly repo: OrderRepository,
    @InjectQueue(EMAIL_QUEUE) private readonly emailQueue: Queue<ConfirmationJobData>,
    @Optional() @Inject(EMAIL_BACKOFF_MS) private readonly backoffMs = 1000,
  ) {}

  async createOrder(dto: CreateOrderDto) {
    const order = await this.repo.save(dto);
    await this.emailQueue.add(
      SEND_CONFIRMATION_JOB,
      { orderId: order.id, email: dto.email },
      confirmationJobOptions(order.id, this.backoffMs),
    );
    return order;
  }
}

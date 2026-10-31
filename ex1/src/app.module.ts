import { Body, Controller, Inject, Module, Post } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { Redis } from 'ioredis';
import { redisConnection } from './config/redis.config.js';
import { EMAIL_QUEUE } from './email/email.constants.js';
import { EmailProcessor } from './email/email.processor.js';
import { EmailIdempotencyStore } from './email/email-idempotency.store.js';
import { ConsoleMailProvider, MailerService } from './mailer/mailer.service.js';
import { OrderRepository, type CreateOrderDto } from './order/order.repository.js';
import { OrderService } from './order/order.service.js';

@Controller('orders')
export class OrderController {
  constructor(@Inject(OrderService) private readonly orders: OrderService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.orders.createOrder(dto);
  }
}

@Module({
  imports: [
    BullModule.forRoot({ connection: redisConnection }),
    BullModule.registerQueue({ name: EMAIL_QUEUE }),
  ],
  controllers: [OrderController],
  providers: [
    OrderRepository,
    OrderService,
    EmailProcessor,
    { provide: MailerService, useFactory: () => new MailerService(new ConsoleMailProvider()) },
    {
      provide: EmailIdempotencyStore,
      useFactory: () => new EmailIdempotencyStore(new Redis(redisConnection)),
    },
  ],
})
export class AppModule {}

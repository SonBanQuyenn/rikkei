import 'reflect-metadata';
import { Body, Controller, Inject, Module, Param, Patch, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { OrderGateway } from './order.gateway.js';

type Notifier = { notifyStatusChanged(orderId: string, status: string): void };
export const ORDER_NOTIFIER = Symbol('ORDER_NOTIFIER');

@Controller('orders')
class OrderController {
  constructor(@Inject(ORDER_NOTIFIER) private readonly notifier: Notifier) {}

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    this.notifier.notifyStatusChanged(id, status);
    return { orderId: id, status };
  }
}

/** Tao app voi gateway tuy chon (ban sua hoac ban loi) de so sanh trong test. */
export async function createApp(gateway: Type<Notifier> = OrderGateway, logger = true) {
  @Module({
    controllers: [OrderController],
    providers: [gateway, { provide: ORDER_NOTIFIER, useExisting: gateway }],
  })
  class AppModule {}

  return NestFactory.create(AppModule, { logger: logger ? undefined : false });
}

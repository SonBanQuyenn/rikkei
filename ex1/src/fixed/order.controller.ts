import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CreateOrderDto } from '../dto.js';

@Controller('orders')
export class OrderController {
  private seq = 0;

  // Toi da 3 don flash sale / 60 giay / tai khoan
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  @Post('flash-sale')
  createFlashSaleOrder(@Body() dto: CreateOrderDto) {
    return { orderId: `FS-${++this.seq}`, productId: dto.productId };
  }
}

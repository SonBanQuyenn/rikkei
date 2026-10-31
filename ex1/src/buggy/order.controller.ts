import { Body, Controller, Post } from '@nestjs/common';
import { CreateOrderDto } from '../dto.js';

@Controller('orders')
export class OrderController {
  private seq = 0;

  @Post('flash-sale')
  createFlashSaleOrder(@Body() dto: CreateOrderDto) {
    return { orderId: `FS-${++this.seq}`, productId: dto.productId };
  }
}

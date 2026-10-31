import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ViewTokenService } from '../shield/engine/view-token.service.js';
import { ShieldGuard, Shielded } from '../shield/shield.guard.js';
import type { RequestContext } from '../shield/shield.types.js';
import { ShopService } from './shop.service.js';

@UseGuards(ShieldGuard)
@Controller('flash-sale/products')
export class ShopController {
  constructor(
    private readonly shop: ShopService,
    private readonly viewTokens: ViewTokenService,
  ) {}

  @Shielded('view')
  @Get(':id')
  view(@Param('id') id: string, @Req() req: Request & { shield: RequestContext }) {
    const product = this.shop.getProduct(id);
    return { ...product, viewToken: this.viewTokens.issue(req.shield.deviceId, id) };
  }

  @Shielded('order')
  @Post(':id/orders')
  order(@Param('id') id: string, @Headers('x-user-id') userId: string | undefined, @Body() body: { quantity?: unknown } | undefined) {
    return this.shop.placeOrder(userId, id, body?.quantity);
  }
}

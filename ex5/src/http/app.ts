import 'reflect-metadata';
import {
  BadRequestException, Body, Controller, Get, Headers, Inject, Module, Param, Patch, Post, Put, Query,
} from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { createShop, type Shop, type ShopOptions } from '../container.js';

const SHOP = Symbol('SHOP');

/** Gia lap xac thuc: userId lay tu header da duoc gateway xac thuc, khong lay tu tham so client tu dat. */
function requireUser(userId: string | undefined): string {
  if (!userId || !/^[\w-]{1,64}$/.test(userId)) throw new BadRequestException('Thieu x-user-id');
  return userId;
}

@Controller()
class ShopController {
  constructor(@Inject(SHOP) private readonly shop: Shop) {}

  @Get('categories')
  categories() {
    return this.shop.catalog.categories();
  }

  @Put('categories')
  updateCategories(@Body('categories') categories: string[]) {
    return this.shop.catalog.updateCategories(categories);
  }

  @Get('products/:id')
  product(@Param('id') id: string) {
    return this.shop.products.findOne(id);
  }

  @Patch('products/:id/price')
  updatePrice(@Param('id') id: string, @Body('price') price: number) {
    return this.shop.products.updatePrice(id, price);
  }

  @Get('cart')
  cart(@Headers('x-user-id') userId?: string) {
    return this.shop.carts.view(requireUser(userId));
  }

  @Post('cart/items')
  addToCart(@Headers('x-user-id') userId: string | undefined, @Body() body: { productId: string; qty: number }) {
    return this.shop.carts.add(requireUser(userId), body.productId, body.qty);
  }

  @Get('reports/top-sellers')
  topSellers(@Query('category') category?: string) {
    return this.shop.reports.topSellers(category);
  }

  @Get('cache/stats')
  stats() {
    return {
      redis: this.shop.client.state,
      pendingInvalidations: this.shop.cache.pendingInvalidationCount,
      byKind: this.shop.metrics.snapshot(),
    };
  }
}

export async function createApp(options: ShopOptions & { logger?: boolean }) {
  const shop = createShop(options);

  @Module({ controllers: [ShopController], providers: [{ provide: SHOP, useValue: shop }] })
  class AppModule {}

  const app = await NestFactory.create(AppModule, { logger: options.logger === false ? false : undefined });
  return { app, shop };
}

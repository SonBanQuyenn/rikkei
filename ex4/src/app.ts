import 'reflect-metadata';
import { Body, Controller, Get, HttpCode, Inject, Module, Param, Post } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Redis } from 'ioredis';
import { InventoryDb } from './db/inventory.db.js';
import { InventoryService } from './inventory/inventory.service.js';
import { StockCache } from './inventory/stock-cache.js';
import { StockSyncWorker } from './inventory/stock-sync.worker.js';

const INVENTORY = Symbol('INVENTORY');

@Controller()
class InventoryController {
  constructor(@Inject(INVENTORY) private readonly inventory: InventoryService) {}

  @Post('orders')
  placeOrder(@Body() body: { productId: string; userId: string; qty: number }) {
    return this.inventory.placeOrder(body.productId, body.userId, body.qty);
  }

  @Post('orders/:id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string) {
    return this.inventory.cancelOrder(id);
  }

  @Get('products/:id/stock')
  async stock(@Param('id') id: string) {
    return { productId: id, available: await this.inventory.available(id) };
  }
}

export type AppOptions = { redis: Redis; db?: InventoryDb; syncIntervalMs?: number; logger?: boolean };

export async function createApp({ redis, db = new InventoryDb(), syncIntervalMs = 1_000, logger = true }: AppOptions) {
  const inventory = new InventoryService(db, new StockCache(redis));
  const worker = new StockSyncWorker(db, syncIntervalMs);

  @Module({
    controllers: [InventoryController],
    providers: [
      { provide: INVENTORY, useValue: inventory },
      { provide: InventoryDb, useValue: db },
      { provide: StockSyncWorker, useValue: worker },
    ],
  })
  class AppModule {}

  // StockSyncWorker tu chay khi module khoi tao va flush lan cuoi khi app dong (onModuleDestroy)
  return NestFactory.create(AppModule, { logger: logger ? undefined : false });
}

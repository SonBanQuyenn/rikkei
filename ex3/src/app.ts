import 'reflect-metadata';
import { BadRequestException, Body, Controller, Get, Inject, Module, Param, Patch, Query } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Redis } from 'ioredis';
import { CatalogCache, DEFAULT_MAX_KEYS } from './catalog/catalog-cache.js';
import { CatalogRepository } from './catalog/catalog.repository.js';
import { CatalogService } from './catalog/catalog.service.js';

const CATALOG_SERVICE = Symbol('CATALOG_SERVICE');

function nonNegativeInt(value: unknown, name: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) throw new BadRequestException(`${name} phai la so nguyen >= 0`);
  return value as number;
}

@Controller()
class CatalogController {
  constructor(@Inject(CATALOG_SERVICE) private readonly service: CatalogService) {}

  @Get('catalog')
  search(@Query() query: Record<string, string | string[] | undefined>) {
    return this.service.search(query);
  }

  @Patch('products/:id/price')
  updatePrice(@Param('id') id: string, @Body('price') price: unknown) {
    return this.service.updatePrice(id, nonNegativeInt(price, 'price'));
  }

  @Patch('products/:id/stock')
  updateStock(@Param('id') id: string, @Body('stock') stock: unknown) {
    return this.service.updateStock(id, nonNegativeInt(stock, 'stock'));
  }
}

export type AppOptions = { redis: Redis; dbLatencyMs?: number; maxKeys?: number; logger?: boolean };

export async function createApp({ redis, dbLatencyMs = 800, maxKeys = DEFAULT_MAX_KEYS, logger = true }: AppOptions) {
  const repo = new CatalogRepository(dbLatencyMs);
  const cache = new CatalogCache(redis, maxKeys);

  @Module({
    controllers: [CatalogController],
    providers: [
      { provide: CatalogRepository, useValue: repo },
      { provide: CatalogCache, useValue: cache },
      { provide: CATALOG_SERVICE, useValue: new CatalogService(repo, cache) },
    ],
  })
  class AppModule {}

  return NestFactory.create(AppModule, { logger: logger ? undefined : false });
}

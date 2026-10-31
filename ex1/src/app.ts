import 'reflect-metadata';
import { Body, Controller, Get, Inject, Module, Param, Patch, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { ProductRepository, type UpdateProductDto } from './product.repository.js';
import { ProductService } from './product.service.js';

type ProductReader = {
  findOne(id: string): Promise<unknown>;
  update(id: string, dto: UpdateProductDto): Promise<unknown>;
};
export const PRODUCT_SERVICE = Symbol('PRODUCT_SERVICE');

@Controller('products')
class ProductController {
  constructor(@Inject(PRODUCT_SERVICE) private readonly service: ProductReader) {}

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.service.update(id, dto);
  }
}

/** Tao app voi service tuy chon (ban sua hoac ban loi) de so sanh trong test. */
export async function createApp(service: Type<ProductReader> = ProductService, logger = true) {
  @Module({
    imports: [CacheModule.register()],
    controllers: [ProductController],
    providers: [ProductRepository, service, { provide: PRODUCT_SERVICE, useExisting: service }],
  })
  class AppModule {}

  return NestFactory.create(AppModule, { logger: logger ? undefined : false });
}

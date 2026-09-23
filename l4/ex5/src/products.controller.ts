import { Controller, Get, Param } from '@nestjs/common';

@Controller('products')
export class ProductsController {
  @Get(':id')
  findOne(@Param('id') id: string) {
    const product = {
      id: Number(id),
      name: 'Sample Product',
      price: 100000,
    };

    return {
      ...product,
      _links: {
        self: { href: `/products/${id}`, method: 'GET' },
        update: { href: `/products/${id}`, method: 'PATCH' },
        delete: { href: `/products/${id}`, method: 'DELETE' },
        buy: { href: `/products/${id}/buy`, method: 'POST' },
      },
    };
  }
}

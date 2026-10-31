// product.service.ts - chay duoc, khong loi cu phap, nhung sai logic (ma goc dang chay o ShopFast)
import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { ProductRepository, type UpdateProductDto } from './product.repository.js';

@Injectable()
export class BuggyProductService {
  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    private repo: ProductRepository,
  ) {}

  async findOne(id: string) {
    const cached = await this.cache.get('product');
    if (cached) return cached;

    const product = await this.repo.findById(id);
    await this.cache.set('product', product);
    return product;
  }

  async update(id: string, dto: UpdateProductDto) {
    return this.repo.update(id, dto);
  }
}

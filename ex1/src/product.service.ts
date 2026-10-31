import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER, type Cache } from '@nestjs/cache-manager';
import { ProductRepository, type Product, type UpdateProductDto } from './product.repository.js';

/** Ban ghi dem song toi da 60s: neu gia doi ma khong qua update() (job ket thuc khuyen mai...) thi cung chi cu toi da 60s. */
export const PRODUCT_CACHE_TTL_MS = 60_000;

/** Moi san pham mot khoa rieng. */
export const productCacheKey = (id: string) => `shopfast:product:${id}`;

@Injectable()
export class ProductService {
  constructor(
    @Inject(CACHE_MANAGER) private cache: Cache,
    private repo: ProductRepository,
  ) {}

  async findOne(id: string): Promise<Product> {
    const key = productCacheKey(id);
    const cached = await this.cache.get<Product>(key);
    if (cached) return cached;

    const product = await this.repo.findById(id);
    if (!product) throw new NotFoundException(`Khong tim thay san pham ${id}`);
    await this.cache.set(key, product, PRODUCT_CACHE_TTL_MS);
    return product;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product> {
    const product = await this.repo.update(id, dto);
    if (!product) throw new NotFoundException(`Khong tim thay san pham ${id}`);
    // Ghi CSDL xong moi xoa ban dem -> request ke tiep doc lai gia moi tu CSDL
    await this.cache.del(productCacheKey(id));
    return product;
  }
}

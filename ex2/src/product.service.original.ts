import type { Redis } from 'ioredis';
import type { ProductRepository } from './product.repository.js';

/** Ham doc san pham hien tai (chua co co che chong don dap) - dung de do "truoc khi sua". */
export class OriginalProductService {
  constructor(
    private readonly redis: Redis,
    private readonly repo: ProductRepository,
  ) {}

  async getProductWithLock(id: string) {
    const key = `shopfast:product:${id}`;
    const cached = await this.redis.get(key);
    if (cached) return JSON.parse(cached);

    const product = await this.repo.findById(id);
    await this.redis.set(key, JSON.stringify(product), 'EX', 300);

    return product;
  }
}

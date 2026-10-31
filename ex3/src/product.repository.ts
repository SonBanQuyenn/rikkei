import { Pool } from 'pg';
import Redis from 'ioredis';

export interface Product {
  id: number;
  name: string;
  price: number;
}

// Doc san pham tu Postgres, cache ket qua trong Redis 60 giay
export class ProductRepository {
  constructor(
    private readonly pool: Pool,
    private readonly redis: Redis,
  ) {}

  async findById(id: number): Promise<Product | null> {
    const cacheKey = `product:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached) as Product;

    const { rows } = await this.pool.query<Product>(
      'SELECT id, name, price::float AS price FROM products WHERE id = $1',
      [id],
    );
    const product = rows[0] ?? null;
    if (product) await this.redis.set(cacheKey, JSON.stringify(product), 'EX', 60);
    return product;
  }
}

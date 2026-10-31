import { Pool } from 'pg';
import Redis from 'ioredis';
import { ProductRepository } from '../../src/product.repository';

// Can Postgres (DATABASE_URL) va Redis (REDIS_URL) that dang chay
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
const repo = new ProductRepository(pool, redis);

beforeAll(async () => {
  await pool.query('DROP TABLE IF EXISTS products');
  await pool.query('CREATE TABLE products (id SERIAL PRIMARY KEY, name TEXT NOT NULL, price NUMERIC NOT NULL)');
  await pool.query("INSERT INTO products (name, price) VALUES ('Ao thun', 150000)");
  await redis.flushdb();
});

afterAll(async () => {
  await pool.end();
  redis.disconnect();
});

describe('ProductRepository (Postgres + Redis)', () => {
  it('doc san pham tu Postgres va ghi vao Redis', async () => {
    const product = await repo.findById(1);
    expect(product).toEqual({ id: 1, name: 'Ao thun', price: 150000 });
    expect(await redis.get('product:1')).not.toBeNull();
  });

  it('lan doc sau lay tu Redis du du lieu DB da doi', async () => {
    await pool.query("UPDATE products SET name = 'Da doi' WHERE id = 1");
    const product = await repo.findById(1);
    expect(product?.name).toBe('Ao thun');
  });

  it('tra ve null khi khong co san pham', async () => {
    expect(await repo.findById(999)).toBeNull();
  });
});

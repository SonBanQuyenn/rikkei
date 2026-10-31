import { setTimeout as sleep } from 'node:timers/promises';

export type Product = { id: string; name: string; price: number; stock: number };

/** Gia lap CSDL: moi truy van mat `latencyMs`, dem so truy van, co the cai loi giua chung. */
export class ProductRepository {
  queries = 0;
  failNext = 0;

  constructor(private readonly latencyMs = 100) {}

  async findById(id: string): Promise<Product> {
    this.queries++;
    await sleep(this.latencyMs);
    if (this.failNext > 0) {
      this.failNext--;
      throw new Error('DB connection reset');
    }
    return { id, name: `Flash sale ${id}`, price: 99_000, stock: 500 };
  }
}

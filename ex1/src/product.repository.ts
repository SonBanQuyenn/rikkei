import { Injectable } from '@nestjs/common';

export type Product = { id: string; name: string; price: number };
export type UpdateProductDto = Partial<Pick<Product, 'name' | 'price'>>;

/** Gia lap bang products trong CSDL, co dem so lan truy van de kiem chung. */
@Injectable()
export class ProductRepository {
  private readonly rows = new Map<string, Product>([
    ['A', { id: 'A', name: 'Ao thun ShopFast', price: 150_000 }],
    ['B', { id: 'B', name: 'Quan jean ShopFast', price: 400_000 }],
  ]);
  queries = 0;

  async findById(id: string): Promise<Product | null> {
    this.queries++;
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  async update(id: string, dto: UpdateProductDto): Promise<Product | null> {
    const row = this.rows.get(id);
    if (!row) return null;
    Object.assign(row, dto);
    return { ...row };
  }
}

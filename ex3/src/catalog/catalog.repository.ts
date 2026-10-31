import { setTimeout as sleep } from 'node:timers/promises';
import type { CatalogQuery, SortBy } from './catalog-query.js';

export type Product = {
  id: string;
  name: string;
  category: string;
  brand: string;
  price: number;
  stock: number;
  sold: number;
  createdAt: number;
};

export type CatalogPage = {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
};

export const PAGE_SIZE = 20;
export const CATEGORIES = ['ao', 'quan', 'giay', 'tui', 'phu-kien'] as const;
export const BRANDS = ['nike', 'adidas', 'puma', 'zara', 'uniqlo', 'hm', 'levis', 'vans'] as const;

const comparators: Record<SortBy, (a: Product, b: Product) => number> = {
  price_asc: (a, b) => a.price - b.price || a.id.localeCompare(b.id),
  newest: (a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id),
  best_selling: (a, b) => b.sold - a.sold || a.id.localeCompare(b.id),
};

/** Gia lap CSDL san pham: truy van tong hop nang mat `latencyMs` (mac dinh 800ms). */
export class CatalogRepository {
  readonly products = new Map<string, Product>();
  queries = 0;

  constructor(private readonly latencyMs = 800) {
    for (let i = 1; i <= 400; i++) {
      const id = `P${String(i).padStart(3, '0')}`;
      this.products.set(id, {
        id,
        name: `San pham ${id}`,
        category: CATEGORIES[i % CATEGORIES.length],
        brand: BRANDS[(i * 3) % BRANDS.length],
        price: 50_000 + ((i * 7919) % 490) * 10_000,
        stock: (i * 13) % 50,
        sold: (i * 37) % 500,
        createdAt: 1_700_000_000_000 + i * 60_000,
      });
    }
  }

  async search(q: CatalogQuery): Promise<CatalogPage> {
    this.queries++;
    await sleep(this.latencyMs);
    const matched = [...this.products.values()]
      .filter((p) => !q.category || p.category === q.category)
      .filter((p) => q.brands.length === 0 || q.brands.includes(p.brand))
      .filter((p) => q.minPrice === undefined || p.price >= q.minPrice)
      .filter((p) => q.maxPrice === undefined || p.price < q.maxPrice)
      .sort(comparators[q.sort]);
    const start = (q.page - 1) * PAGE_SIZE;
    return {
      items: matched.slice(start, start + PAGE_SIZE).map((p) => ({ ...p })),
      total: matched.length,
      page: q.page,
      pageSize: PAGE_SIZE,
    };
  }

  async updatePrice(id: string, price: number): Promise<Product | undefined> {
    const p = this.products.get(id);
    if (p) p.price = price;
    return p && { ...p };
  }

  async updateStock(id: string, stock: number): Promise<Product | undefined> {
    const p = this.products.get(id);
    if (p) p.stock = stock;
    return p && { ...p };
  }
}

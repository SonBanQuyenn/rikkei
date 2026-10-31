import { setTimeout as sleep } from 'node:timers/promises';

export type Product = { id: string; name: string; category: string; price: number };
export type CartLine = { productId: string; qty: number };
export type TopSeller = { productId: string; name: string; sold: number };

export type Table = 'categories' | 'products' | 'carts' | 'orders';

/** Do tre gia lap cho tung loai truy van (ms). Tong hop top ban chay quet ca bang don hang nen cham nhat. */
export const DEFAULT_LATENCY: Record<Table, number> = { categories: 20, products: 30, carts: 15, orders: 400 };

/** CSDL gia lap cua ShopFast, dem so truy van va tong thoi gian CSDL phai lam viec theo bang. */
export class FakeDb {
  readonly queries: Record<Table, number> = { categories: 0, products: 0, carts: 0, orders: 0 };
  /** Tong ms CSDL ban - dai dien cho chi phi CSDL */
  busyMs = 0;

  readonly categories = ['ao', 'quan', 'giay', 'tui', 'phu-kien'];
  readonly products = new Map<string, Product>();
  readonly carts = new Map<string, CartLine[]>();
  readonly orders: { productId: string; qty: number }[] = [];

  constructor(private readonly latency: Record<Table, number> = DEFAULT_LATENCY) {
    for (let i = 1; i <= 200; i++) {
      const id = `P${String(i).padStart(3, '0')}`;
      this.products.set(id, { id, name: `San pham ${id}`, category: this.categories[i % 5], price: 100_000 + i * 1_000 });
    }
    for (let i = 0; i < 5_000; i++) this.orders.push({ productId: `P${String((i * 7) % 200 + 1).padStart(3, '0')}`, qty: 1 + (i % 3) });
  }

  async listCategories(): Promise<string[]> {
    await this.query('categories');
    return [...this.categories];
  }

  async renameCategories(categories: string[]): Promise<void> {
    await this.query('categories');
    this.categories.splice(0, this.categories.length, ...categories);
  }

  async findProduct(id: string): Promise<Product | null> {
    await this.query('products');
    const p = this.products.get(id);
    return p ? { ...p } : null;
  }

  async updatePrice(id: string, price: number): Promise<Product | null> {
    await this.query('products');
    const p = this.products.get(id);
    if (!p) return null;
    p.price = price;
    return { ...p };
  }

  async getCart(userId: string): Promise<CartLine[]> {
    await this.query('carts');
    return (this.carts.get(userId) ?? []).map((l) => ({ ...l }));
  }

  async addToCart(userId: string, productId: string, qty: number): Promise<void> {
    await this.query('carts');
    const lines = this.carts.get(userId) ?? [];
    const line = lines.find((l) => l.productId === productId);
    if (line) line.qty += qty;
    else lines.push({ productId, qty });
    this.carts.set(userId, lines);
  }

  async topSellers(category: string, limit = 10): Promise<TopSeller[]> {
    await this.query('orders');
    const sold = new Map<string, number>();
    for (const o of this.orders) {
      const p = this.products.get(o.productId);
      if (p && (category === 'all' || p.category === category)) sold.set(o.productId, (sold.get(o.productId) ?? 0) + o.qty);
    }
    return [...sold.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([productId, n]) => ({ productId, name: this.products.get(productId)!.name, sold: n }));
  }

  totalQueries() {
    return Object.values(this.queries).reduce((a, b) => a + b, 0);
  }

  private async query(table: Table) {
    this.queries[table]++;
    this.busyMs += this.latency[table];
    await sleep(this.latency[table]);
  }
}

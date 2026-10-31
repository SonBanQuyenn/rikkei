import { BadRequestException, NotFoundException } from '@nestjs/common';
import { POLICIES } from '../cache/cache-policies.js';
import type { CacheService } from '../cache/cache.service.js';
import type { FakeDb, Product, TopSeller } from '../data/fake-db.js';

/** Tang nghiep vu: chi biet "loai du lieu nao, nap tu dau" - khong biet gi ve Redis. */

export class CatalogService {
  constructor(
    private readonly db: FakeDb,
    private readonly cache: CacheService,
  ) {}

  categories(): Promise<string[]> {
    return this.cache.getOrLoad(POLICIES.categories, [], () => this.db.listCategories());
  }

  async updateCategories(categories: string[]): Promise<string[]> {
    if (!Array.isArray(categories) || categories.length === 0 || !categories.every((c) => typeof c === 'string' && c.trim())) {
      throw new BadRequestException('categories phai la mang ten danh muc');
    }
    await this.db.renameCategories(categories);
    await this.cache.invalidate(POLICIES.categories, []);
    return categories;
  }
}

export class ProductService {
  constructor(
    private readonly db: FakeDb,
    private readonly cache: CacheService,
  ) {}

  async findOne(id: string): Promise<Product> {
    const product = await this.cache.getOrLoad(POLICIES.product, [id], () => this.db.findProduct(id));
    if (!product) throw new NotFoundException(`Khong tim thay san pham ${id}`);
    return product;
  }

  async updatePrice(id: string, price: number): Promise<Product> {
    if (!Number.isInteger(price) || price <= 0) throw new BadRequestException('price phai la so nguyen duong');
    const product = await this.db.updatePrice(id, price);
    if (!product) throw new NotFoundException(`Khong tim thay san pham ${id}`);
    // Ghi CSDL xong moi vo hieu hoa; request ke tiep doc gia moi
    await this.cache.invalidate(POLICIES.product, [id]);
    return product;
  }
}

export type CartView = {
  userId: string;
  items: { productId: string; name: string; price: number; qty: number; lineTotal: number }[];
  total: number;
};

export class CartService {
  constructor(
    private readonly db: FakeDb,
    private readonly cache: CacheService,
    private readonly products: ProductService,
  ) {}

  /** Chi dem cac dong (productId, qty) cua rieng nguoi dung; gia luon ghep tu ban ghi san pham -> doi gia la gio hang thay ngay. */
  async view(userId: string): Promise<CartView> {
    const lines = await this.cache.getOrLoad(POLICIES.cart, [userId], () => this.db.getCart(userId));
    const items = await Promise.all(
      lines.map(async (l) => {
        const p = await this.products.findOne(l.productId);
        return { productId: p.id, name: p.name, price: p.price, qty: l.qty, lineTotal: p.price * l.qty };
      }),
    );
    return { userId, items, total: items.reduce((s, i) => s + i.lineTotal, 0) };
  }

  async add(userId: string, productId: string, qty: number): Promise<CartView> {
    if (!Number.isInteger(qty) || qty < 1) throw new BadRequestException('qty phai la so nguyen duong');
    await this.products.findOne(productId);
    await this.db.addToCart(userId, productId, qty);
    await this.cache.invalidate(POLICIES.cart, [userId]);
    return this.view(userId);
  }
}

export class ReportService {
  constructor(
    private readonly db: FakeDb,
    private readonly cache: CacheService,
  ) {}

  topSellers(category = 'all'): Promise<TopSeller[]> {
    if (category !== 'all' && !this.db.categories.includes(category)) throw new BadRequestException('Danh muc khong ton tai');
    return this.cache.getOrLoad(POLICIES.topSellers, [category], () => this.db.topSellers(category));
  }
}

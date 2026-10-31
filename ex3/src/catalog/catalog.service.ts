import { NotFoundException } from '@nestjs/common';
import { ALL_CATEGORIES, type CatalogCache } from './catalog-cache.js';
import { parseCatalogQuery } from './catalog-query.js';
import { BRANDS, CATEGORIES, type CatalogPage, type CatalogRepository, type Product } from './catalog.repository.js';

/** Chi dem 3 trang dau; tu trang 4 doc thang CSDL vi rat it nguoi xem. */
export const CACHED_PAGES = 3;

export type CacheStatus = 'HIT' | 'MISS' | 'MISS_NOT_STORED' | 'BYPASS';
export type CatalogResponse = CatalogPage & { cache: CacheStatus };

export class CatalogService {
  constructor(
    private readonly repo: CatalogRepository,
    private readonly cache: CatalogCache,
  ) {}

  async search(raw: Record<string, string | string[] | undefined>): Promise<CatalogResponse> {
    // 1. Kiem tra + chuan hoa; tham so sai -> 400, khong sinh khoa
    const query = parseCatalogQuery(raw, CATEGORIES, BRANDS);

    // 2. Trang >= 4 -> khong dem
    if (query.page > CACHED_PAGES) return { ...(await this.repo.search(query)), cache: 'BYPASS' };

    // 3. Khoa = nhom (danh muc) + phien ban nhom + tham so chuan hoa
    const scope = query.category ?? ALL_CATEGORIES;
    const key = this.cache.keyFor(scope, await this.cache.version(scope), query);

    const hit = await this.cache.get(key);
    if (hit) return { ...hit, cache: 'HIT' };

    // 4. Truot -> truy van CSDL, ghi dem (neu chua cham tran so khoa)
    // Neu gia doi trong luc dang truy van, phien ban da tang -> ket qua nay nam o khoa cu, khong ai doc
    const page = await this.repo.search(query);
    const stored = await this.cache.set(key, page);
    return { ...page, cache: stored ? 'MISS' : 'MISS_NOT_STORED' };
  }

  async updatePrice(id: string, price: number): Promise<Product> {
    const product = await this.repo.updatePrice(id, price);
    if (!product) throw new NotFoundException(`Khong tim thay san pham ${id}`);
    // Gia phai chinh xac tuyet doi: vo hieu hoa ngay ca nhom danh muc (ke ca ket qua san pham vua lot vao/ra khoi khoang gia)
    await this.cache.invalidateCategory(product.category);
    return product;
  }

  async updateStock(id: string, stock: number): Promise<Product> {
    const product = await this.repo.updateStock(id, stock);
    if (!product) throw new NotFoundException(`Khong tim thay san pham ${id}`);
    // Ton kho duoc tre toi da 60s: cac ket qua chua san pham nay tu lam moi khi het TTL 60s.
    // Khong vo hieu hoa ngay vi ton kho doi theo tung don hang -> xoa ngay se lam ti le trung gan bang 0 gio cao diem.
    return product;
  }
}

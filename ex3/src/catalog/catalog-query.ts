import { BadRequestException } from '@nestjs/common';

export const SORTS = ['price_asc', 'newest', 'best_selling'] as const;
export type SortBy = (typeof SORTS)[number];

/** Cac moc gia giao dien cho chon; chi chap nhan cac moc nay -> khong sinh vo so khoa tu gia tuy y. */
export const PRICE_STEPS = [0, 100_000, 200_000, 300_000, 500_000, 1_000_000, 2_000_000, 5_000_000] as const;
export const MAX_BRANDS = 3;
export const MAX_PAGE = 1_000;

export type CatalogQuery = {
  category?: string;
  brands: string[];
  minPrice?: number;
  maxPrice?: number;
  sort: SortBy;
  page: number;
};

type RawQuery = Record<string, string | string[] | undefined>;

const bad = (msg: string) => new BadRequestException(msg);

function single(raw: RawQuery, name: string): string | undefined {
  const v = raw[name];
  if (Array.isArray(v)) throw bad(`Tham so ${name} chi duoc truyen mot lan`);
  const s = v?.trim().toLowerCase();
  return s === '' ? undefined : s;
}

function priceStep(raw: RawQuery, name: string): number | undefined {
  const s = single(raw, name);
  if (s === undefined) return undefined;
  const n = Number(s);
  if (!/^\d+$/.test(s) || !(PRICE_STEPS as readonly number[]).includes(n)) {
    throw bad(`${name} phai la mot trong cac moc: ${PRICE_STEPS.join(', ')}`);
  }
  return n;
}

/**
 * Doc tham so tu query string, kiem tra theo danh sach cho phep va dua ve dang chuan:
 * chu thuong, brand sap xep + bo trung, minPrice=0 coi nhu khong loc, gia tri mac dinh dien san.
 * Tham so la (utm_source, fbclid, ...) bi bo qua - khong tham gia vao khoa.
 */
export function parseCatalogQuery(
  raw: RawQuery,
  categories: readonly string[],
  brands: readonly string[],
): CatalogQuery {
  const category = single(raw, 'category');
  if (category !== undefined && !categories.includes(category)) throw bad(`Danh muc khong ton tai: ${category}`);

  const brandValues = ([] as string[]).concat(raw.brand ?? []);
  const brandList = [...new Set(brandValues.flatMap((v) => v.split(',')).map((b) => b.trim().toLowerCase()).filter(Boolean))].sort();
  if (brandList.length > MAX_BRANDS) throw bad(`Chon toi da ${MAX_BRANDS} thuong hieu`);
  for (const b of brandList) if (!brands.includes(b)) throw bad(`Thuong hieu khong ton tai: ${b}`);

  const minPrice = priceStep(raw, 'minPrice') || undefined;
  const maxPrice = priceStep(raw, 'maxPrice');
  if (maxPrice === 0) throw bad('maxPrice phai lon hon 0');
  if (minPrice !== undefined && maxPrice !== undefined && minPrice >= maxPrice) throw bad('minPrice phai nho hon maxPrice');

  const sort = (single(raw, 'sort') ?? 'best_selling') as SortBy;
  if (!SORTS.includes(sort)) throw bad(`sort phai la mot trong: ${SORTS.join(', ')}`);

  const pageRaw = single(raw, 'page') ?? '1';
  const page = Number(pageRaw);
  if (!/^\d+$/.test(pageRaw) || page < 1 || page > MAX_PAGE) throw bad(`page phai la so nguyen 1..${MAX_PAGE}`);

  return { category, brands: brandList, minPrice, maxPrice, sort, page };
}

/** Phan khoa sinh tu tham so da chuan hoa - thu tu co dinh, khong phu thuoc thu tu nguoi dung gui. */
export function canonicalQuery(q: CatalogQuery): string {
  return [
    `b=${q.brands.join(',') || '*'}`,
    `p=${q.minPrice ?? 0}-${q.maxPrice ?? 'max'}`,
    `s=${q.sort}`,
    `pg=${q.page}`,
  ].join('|');
}

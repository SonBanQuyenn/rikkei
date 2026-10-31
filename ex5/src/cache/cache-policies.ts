/** Chinh sach luu dem cho tung loai du lieu - noi duy nhat quyet dinh khoa, thoi gian song, cach vo hieu hoa. */

export type DataKind = 'static' | 'product' | 'user' | 'aggregate';

export type CachePolicy<A extends unknown[]> = {
  kind: DataKind;
  key: (...args: A) => string;
  ttlSec: number;
  /** Cong them 0..jitterSec giay de cac khoa khong het han cung luc */
  jitterSec: number;
  /** Du lieu co the bi ghi trong luc dang nap -> dung epoch chong ghi de gia tri cu */
  guardWrites: boolean;
};

const NS = 'sf:v1';

const definePolicy = <A extends unknown[]>(policy: CachePolicy<A>) => policy;

export const POLICIES = {
  /** Danh muc: hau nhu khong doi, doc o moi trang. Song 24h, xoa khi admin sua. */
  categories: definePolicy<[]>({
    kind: 'static',
    key: () => `${NS}:static:categories`,
    ttlSec: 24 * 3600,
    jitterSec: 3600,
    guardWrites: false,
  }),

  /** San pham (co gia): doi thuong xuyen, gia phai dung. Song 5 phut, xoa ngay khi ghi + chan ghi de gia cu. */
  product: definePolicy<[id: string]>({
    kind: 'product',
    key: (id) => `${NS}:product:${id}`,
    ttlSec: 300,
    jitterSec: 60,
    guardWrites: true,
  }),

  /** Gio hang: rieng tung nguoi, khoa gan userId da xac thuc. Song 30 phut, xoa khi nguoi do sua gio. */
  cart: definePolicy<[userId: string]>({
    kind: 'user',
    key: (userId) => `${NS}:user:${userId}:cart`,
    ttlSec: 1800,
    jitterSec: 0,
    guardWrites: true,
  }),

  /** Top ban chay: tong hop nang (quet bang don hang). Song 10 phut, chap nhan tre, khong xoa khi co don moi. */
  topSellers: definePolicy<[category: string]>({
    kind: 'aggregate',
    key: (category) => `${NS}:agg:top-sellers:${category}`,
    ttlSec: 600,
    jitterSec: 120,
    guardWrites: false,
  }),
};

export const epochKeyOf = (key: string) => `${key}:epoch`;

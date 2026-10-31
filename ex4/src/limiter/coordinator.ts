import { LeakyBucket } from './leaky-bucket.js';

export interface Decision {
  allowed: boolean;
  /** Cho qua: so ms phai cho truoc khi gui sang ngan hang */
  delayMs: number;
  /** Bi chan: bao lau nua hang doi co cho trong */
  retryAfterMs: number;
  /** 'central' = bo dieu phoi chung quyet dinh; 'unavailable' = khong hoi duoc bo dieu phoi */
  source: 'central' | 'unavailable';
}

export interface CoordinatorOptions {
  /** Toc do gui toi da (giao dich/giay), phai <= nguong doi tac tru bien do tre mang */
  rate: number;
  /** Do tre toi da chap nhan de hap thu xung ngan */
  maxDelayMs: number;
  /** Ngan sach bo nho cho bo dem (byte). Mac dinh 128MB = 1/2 cua 256MB, phan con lai cho runtime. */
  memoryBudgetBytes?: number;
}

/** Uoc luong du cho 1 khoa: Map entry + doi tuong LeakyBucket + chuoi khoa (do thuc te ~150 byte). */
export const BYTES_PER_KEY = 256;

/**
 * Bo dieu phoi trung tam: noi DUY NHAT giu trang thai, moi tien trinh gateway hoi qua day.
 * Chay don luong -> moi lan quyet dinh la nguyen tu, khong co race giua 6 tien trinh.
 * Dung dong ho cua chinh no -> lech dong ho giua cac may khong anh huong.
 */
export class Coordinator {
  private buckets = new Map<string, LeakyBucket>();
  readonly maxKeys: number;

  constructor(private readonly opts: CoordinatorOptions) {
    this.maxKeys = Math.floor((opts.memoryBudgetBytes ?? 128 * 1024 * 1024) / BYTES_PER_KEY);
    if (this.maxKeys < 1) throw new RangeError('Ngan sach bo nho khong du cho mot khoa');
  }

  acquire(key: string, now: number): Decision {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= this.maxKeys) this.sweep(now);
      // Van day: tu choi thay vi cap phat vuot ngan sach (an toan > tien loi)
      if (this.buckets.size >= this.maxKeys) return { allowed: false, delayMs: 0, retryAfterMs: 1000, source: 'central' };
      bucket = new LeakyBucket(this.opts.rate, this.opts.maxDelayMs);
      this.buckets.set(key, bucket);
    }
    const delay = bucket.schedule(now);
    if (delay === null) return { allowed: false, delayMs: 0, retryAfterMs: Math.ceil(bucket.retryAfter(now)), source: 'central' };
    return { allowed: true, delayMs: delay, retryAfterMs: 0, source: 'central' };
  }

  /** Xoa khoa co hang doi da rong - trang thai cua chung khong con thong tin gi. */
  sweep(now: number) {
    for (const [key, bucket] of this.buckets) if (bucket.isIdle(now)) this.buckets.delete(key);
  }

  get keyCount() {
    return this.buckets.size;
  }
}

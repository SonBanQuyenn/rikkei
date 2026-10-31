export type PlanName = 'free' | 'pro' | 'enterprise';

export interface PlanLimits {
  perMinute: number;
  /** null = khong gioi han theo ngay */
  perDay: number | null;
}

/** Chinh sach kinh doanh cua phong kinh doanh, dich sang so lieu ky thuat. */
export const PLANS: Record<PlanName, PlanLimits> = {
  free: { perMinute: 60, perDay: 5_000 },
  pro: { perMinute: 600, perDay: 200_000 },
  enterprise: { perMinute: 6_000, perDay: null },
};

/** Endpoint ton tai nguyen: moi goi deu chi 10 request / gio. */
export const EXPENSIVE_LIMIT = { limit: 10, windowMs: 60 * 60_000 };

/** Request khong co khoa / khoa da thu hoi / khoa khong ton tai -> han muc thap nhat. */
export const LOWEST_PLAN: PlanName = 'free';

export const MINUTE = 60_000;
export const DAY = 24 * 60 * 60_000;

/** Hanh dong duoc bao ve: xem trang flash sale hoac dat don. */
export type ShieldAction = 'view' | 'order';

export type LayerName = 'velocity' | 'behavior' | 'account-farm';

/** Thong tin cua mot request ma cac lop phong thu can (doc lap voi Express/Nest). */
export interface RequestContext {
  requestId: string;
  action: ShieldAction;
  ip: string;
  deviceId: string;
  userId?: string;
  productId?: string;
  viewToken?: string;
  passToken?: string;
  path: string;
  now: number;
}

/** Ket luan cua mot lop khi phat hien hanh vi lam dung. */
export interface Verdict {
  layer: LayerName;
  rule: string;
  /** Gia tri do duoc (so request, so tai khoan, so ms...) */
  observed: number | string;
  threshold: number | string;
  /** Thong bao cho nguoi dung */
  message: string;
  /** HTTP status tra ve */
  status: 403 | 429;
}

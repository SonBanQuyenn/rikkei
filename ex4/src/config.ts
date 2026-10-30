export interface DashboardConfig {
  /** Heartbeat phai nho hon han 60s idle timeout cua bo can bang tai. */
  heartbeatMs: number;
  /** Trinh duyet cho bao lau truoc khi tu ket noi lai (truong `retry:` cua SSE). */
  retryMs: number;
  /** So su kien gan nhat giu lai de phat bu cho client ket noi lai. */
  bufferSize: number;
  /** Bat bo gia lap du lieu (tat trong test). */
  simulate: boolean;
}

export const DEFAULT_CONFIG: DashboardConfig = {
  heartbeatMs: 20_000, // 20s << 60s: ke ca ban dem khong co du lieu, ket noi van khong bi LB cat
  retryMs: 3_000, // mang kho rot vai giay -> 3s sau tu noi lai
  bufferSize: 1_000,
  simulate: true,
};

export const DASHBOARD_CONFIG = Symbol('DASHBOARD_CONFIG');

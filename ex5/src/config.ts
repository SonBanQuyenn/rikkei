export interface DispatchConfig {
  /** Don cho gan qua lau -> canh bao "don dang tac". */
  pendingLimitMs: number;
  /** Tai xe khong tra loi de nghi nhan don -> thu hoi, don ve hang cho. */
  offerTimeoutMs: number;
  /** Tai xe dang giao ma khong gui vi tri/tien do -> canh bao. */
  silentLimitMs: number;
  /** Chu ky kiem tra tinh trang tac nghen. */
  monitorIntervalMs: number;
  /** Bi mat dung de ky token. */
  tokenSecret: string;
}

export const DEFAULT_CONFIG: DispatchConfig = {
  pendingLimitMs: 5 * 60_000,
  offerTimeoutMs: 60_000,
  silentLimitMs: 3 * 60_000,
  monitorIntervalMs: 10_000,
  tokenSecret: process.env.TOKEN_SECRET ?? 'shopfast-dev-secret',
};

export const DISPATCH_CONFIG = Symbol('DISPATCH_CONFIG');

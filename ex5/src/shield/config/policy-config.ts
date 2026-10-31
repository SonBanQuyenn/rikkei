/** Nguong cua tung lop - doi duoc luc dang chay qua PolicyConfigStore. */
export interface PolicyConfig {
  velocity: {
    enabled: boolean;
    windowMs: number;
    maxPerDevice: number;
    maxPerIp: number;
  };
  behavior: {
    enabled: boolean;
    /** Nguoi that can it nhat chung nay ms tu luc mo trang toi luc bam dat */
    minViewToOrderMs: number;
    /** Ma xem trang het han sau chung nay ms */
    viewTokenTtlMs: number;
  };
  accountFarm: {
    enabled: boolean;
    windowMs: number;
    maxAccountsPerDevice: number;
  };
  challenge: {
    /** Giai thu thach xong duoc mien kiem tra trong chung nay ms */
    passTtlMs: number;
    challengeTtlMs: number;
    maxAttempts: number;
  };
}

export const DEFAULT_POLICY_CONFIG: PolicyConfig = {
  velocity: { enabled: true, windowMs: 10_000, maxPerDevice: 20, maxPerIp: 60 },
  behavior: { enabled: true, minViewToOrderMs: 1_500, viewTokenTtlMs: 10 * 60_000 },
  accountFarm: { enabled: true, windowMs: 60 * 60_000, maxAccountsPerDevice: 3 },
  challenge: { passTtlMs: 2 * 60_000, challengeTtlMs: 5 * 60_000, maxAttempts: 3 },
};

/** Phan API Redis ma tang dem can - de thay the bang client gia lap/hong khi kiem thu. */
export interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttlSec: number): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  eval(script: string, numKeys: number, ...args: (string | number)[]): Promise<unknown>;
}

export type CircuitState = 'closed' | 'open' | 'half-open';

export type RedisClientOptions = {
  /** Lenh Redis cham hon nguong nay coi nhu loi -> request khong bi keo cham theo Redis */
  timeoutMs?: number;
  /** So lan loi lien tiep truoc khi ngat mach */
  failureThreshold?: number;
  /** Thoi gian ngat mach: khong goi Redis, di thang CSDL */
  openMs?: number;
};

/** Ghi neu epoch cua khoa chua doi ke tu luc doc CSDL -> khong ghi de gia tri cu sau khi vua vo hieu hoa. */
const SET_IF_EPOCH_SCRIPT = `
local current = redis.call('get', KEYS[2]) or '0'
if current ~= ARGV[3] then return 0 end
redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2])
return 1`;

export class RedisUnavailableError extends Error {}

/**
 * Lop truy cap Redis: moi lenh co thoi gian cho toi da va cau dao (circuit breaker).
 * Khong bao gio nem loi ra ngoai tang nghiep vu - tra ve { ok: false } de tang tren di thang CSDL.
 */
export class RedisCacheClient {
  private readonly timeoutMs: number;
  private readonly failureThreshold: number;
  private readonly openMs: number;
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(
    private readonly redis: RedisLike,
    { timeoutMs = 50, failureThreshold = 5, openMs = 5_000 }: RedisClientOptions = {},
  ) {
    this.timeoutMs = timeoutMs;
    this.failureThreshold = failureThreshold;
    this.openMs = openMs;
  }

  get state(): CircuitState {
    if (this.consecutiveFailures < this.failureThreshold) return 'closed';
    return Date.now() - this.openedAt >= this.openMs ? 'half-open' : 'open';
  }

  get(key: string) {
    return this.exec(() => this.redis.get(key));
  }

  set(key: string, value: string, ttlSec: number) {
    return this.exec(() => this.redis.set(key, value, 'EX', ttlSec));
  }

  setIfEpoch(key: string, epochKey: string, epoch: string, value: string, ttlSec: number) {
    return this.exec(async () => (await this.redis.eval(SET_IF_EPOCH_SCRIPT, 2, key, epochKey, value, ttlSec, epoch)) === 1);
  }

  /** Tang epoch roi xoa khoa: moi lan nap dang dang do (doc CSDL truoc khi doi) se khong ghi duoc. */
  invalidate(key: string, epochKey?: string) {
    return this.exec(async () => {
      if (epochKey) await this.redis.incr(epochKey);
      return this.redis.del(key);
    });
  }

  private async exec<T>(command: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    if (this.state === 'open') return { ok: false };
    let timer: NodeJS.Timeout | undefined;
    try {
      const value = await Promise.race([
        command(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new RedisUnavailableError('Redis timeout')), this.timeoutMs);
        }),
      ]);
      this.consecutiveFailures = 0;
      return { ok: true, value };
    } catch {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= this.failureThreshold) this.openedAt = Date.now();
      return { ok: false };
    } finally {
      clearTimeout(timer);
    }
  }
}

import type { Redis } from 'ioredis';

export const stockKey = (productId: string) => `shopfast:stock:${productId}`;
/** Tap orderId da giu cho trong Redis - dung de chong tru/hoan hai lan. */
export const heldKey = (productId: string) => `shopfast:stock:${productId}:held`;
/** Tap orderId PENDING ma lan dung lai da tru tam (chua biet Redis cu co cho qua hay khong). */
export const provisionalKey = (productId: string) => `shopfast:stock:${productId}:provisional`;
const rebuildLockKey = (productId: string) => `shopfast:stock:${productId}:rebuild-lock`;

export const MISSING = -2;
export const OUT_OF_STOCK = -1;

/**
 * Kiem tra va tru kho NGUYEN TU trong mot script Lua (Redis chay script don luong):
 * - khoa ton kho mat (Redis vua khoi dong lai) -> MISSING, phai dung lai tu CSDL;
 * - don da nam trong tap held -> da tru roi, khong tru lan nua;
 * - don nam trong tap provisional (lan dung lai da tru tam) -> so luong da bi tru san,
 *   chi chap nhan neu ton kho sau khi tru tam van >= 0, nguoc lai tra lai va tu choi;
 * - khong du hang -> OUT_OF_STOCK; du -> tru va ghi nhan don.
 */
const RESERVE_SCRIPT = `
local stock = redis.call('get', KEYS[1])
if not stock then return -2 end
if redis.call('sismember', KEYS[2], ARGV[1]) == 1 then return tonumber(stock) end
if redis.call('srem', KEYS[3], ARGV[1]) == 1 then
  if tonumber(stock) >= 0 then
    redis.call('sadd', KEYS[2], ARGV[1])
    return tonumber(stock)
  end
  redis.call('incrby', KEYS[1], ARGV[2])
  return -1
end
if tonumber(stock) < tonumber(ARGV[2]) then return -1 end
redis.call('sadd', KEYS[2], ARGV[1])
return redis.call('decrby', KEYS[1], ARGV[2])`;

/** Hoan kho: chi cong lai neu don thuc su dang giu cho (SREM tra 1) -> huy hai lan khong cong hai lan. */
const RELEASE_SCRIPT = `
if redis.call('exists', KEYS[1]) == 0 then return -2 end
if redis.call('srem', KEYS[2], ARGV[1]) == 0 and redis.call('srem', KEYS[3], ARGV[1]) == 0 then return 0 end
redis.call('incrby', KEYS[1], ARGV[2])
return 1`;

/** Ghi so lieu dung lai tu CSDL - chi khi khoa van chua co (mot instance khac co the vua dung xong). */
const REBUILD_SCRIPT = `
if redis.call('exists', KEYS[1]) == 1 then return 0 end
redis.call('del', KEYS[2], KEYS[3])
local held = tonumber(ARGV[2])
for i = 3, 2 + held do redis.call('sadd', KEYS[2], ARGV[i]) end
for i = 3 + held, #ARGV do redis.call('sadd', KEYS[3], ARGV[i]) end
redis.call('set', KEYS[1], ARGV[1])
return 1`;

const RELEASE_LOCK_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end
return 0`;

/** Lop truy cap Redis cho ton kho. */
export class StockCache {
  constructor(private readonly redis: Redis) {}

  /** >= 0: so con lai sau khi tru; OUT_OF_STOCK; MISSING */
  async reserve(productId: string, orderId: string, qty: number): Promise<number> {
    return Number(await this.redis.eval(RESERVE_SCRIPT, 3, ...this.keys(productId), orderId, qty));
  }

  /** 1: da hoan; 0: don khong giu cho (khong lam gi); MISSING */
  async release(productId: string, orderId: string, qty: number): Promise<number> {
    return Number(await this.redis.eval(RELEASE_SCRIPT, 3, ...this.keys(productId), orderId, qty));
  }

  async writeRebuild(
    productId: string,
    available: number,
    heldOrderIds: string[],
    provisionalOrderIds: string[] = [],
  ): Promise<boolean> {
    const r = await this.redis.eval(
      REBUILD_SCRIPT, 3, ...this.keys(productId),
      available, heldOrderIds.length, ...heldOrderIds, ...provisionalOrderIds,
    );
    return r === 1;
  }

  async available(productId: string): Promise<number | null> {
    const v = await this.redis.get(stockKey(productId));
    return v === null ? null : Number(v);
  }

  private keys(productId: string) {
    return [stockKey(productId), heldKey(productId), provisionalKey(productId)];
  }

  async tryLockRebuild(productId: string, token: string, ttlMs: number): Promise<boolean> {
    return (await this.redis.set(rebuildLockKey(productId), token, 'PX', ttlMs, 'NX')) === 'OK';
  }

  async unlockRebuild(productId: string, token: string): Promise<void> {
    await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, rebuildLockKey(productId), token);
  }
}

import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import {
  BURST_WINDOW_MS,
  CAMPAIGN_CAP_PER_BURST,
  CAMPAIGN_CAP_PER_SEC,
  CAMPAIGN_YIELD_TOTAL_PER_SEC,
  RATE_WINDOW_MS,
  TOTAL_CAP_PER_BURST,
  TOTAL_CAP_PER_SEC,
} from '../config/email.config.js';

/**
 * Cua so truot dung chung cho moi tien trinh. Hai ZSET trong Redis luu thoi diem cac lan goi da cap:
 * KEYS[1] = moi lan goi nha cung cap, KEYS[2] = rieng email chien dich.
 * Kiem tra moi rang buoc (key, cua so, tran) va cap suat nguyen tu trong Lua; dong ho lay tu Redis TIME
 * de 4 tien trinh khong lech gio nhau. Tra ve 0 = duoc goi ngay; > 0 = so ms toi thieu can cho.
 */
const ACQUIRE = `
local t = redis.call('TIME')
local now = tonumber(t[1]) * 1000 + math.floor(tonumber(t[2]) / 1000)
local longest = tonumber(ARGV[3])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - longest)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now - longest)
local wait = 0
for i = 4, #ARGV, 3 do
  local key = KEYS[tonumber(ARGV[i])]
  local window, cap = tonumber(ARGV[i + 1]), tonumber(ARGV[i + 2])
  local used = redis.call('ZCOUNT', key, now - window + 1, '+inf')
  if used >= cap then
    local e = redis.call('ZRANGEBYSCORE', key, now - window + 1, '+inf', 'WITHSCORES', 'LIMIT', used - cap, 1)
    wait = math.max(wait, tonumber(e[2]) + window - now)
  end
end
if wait > 0 then return wait end
redis.call('ZADD', KEYS[1], now, ARGV[1])
redis.call('PEXPIRE', KEYS[1], longest * 2)
if ARGV[2] == 'campaign' then
  redis.call('ZADD', KEYS[2], now, ARGV[1])
  redis.call('PEXPIRE', KEYS[2], longest * 2)
end
return 0`;

export type TrafficKind = 'campaign' | 'transactional';
/** [key: 1 = tong, 2 = chien dich, cua so ms, tran] */
type Rule = [1 | 2, number, number];

const RULES: Record<TrafficKind, Rule[]> = {
  transactional: [
    [1, RATE_WINDOW_MS, TOTAL_CAP_PER_SEC],
    [1, BURST_WINDOW_MS, TOTAL_CAP_PER_BURST],
  ],
  campaign: [
    [2, RATE_WINDOW_MS, CAMPAIGN_CAP_PER_SEC],
    [2, BURST_WINDOW_MS, CAMPAIGN_CAP_PER_BURST],
    [1, RATE_WINDOW_MS, CAMPAIGN_YIELD_TOTAL_PER_SEC],
    [1, BURST_WINDOW_MS, TOTAL_CAP_PER_BURST],
  ],
};

export class ProviderRateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly key = 'email-provider:calls',
  ) {}

  async tryAcquire(kind: TrafficKind): Promise<number> {
    const rules = RULES[kind].flat();
    const result = await this.redis.eval(
      ACQUIRE,
      2,
      this.key,
      `${this.key}:campaign`,
      randomUUID(),
      kind,
      RATE_WINDOW_MS,
      ...rules,
    );
    return Number(result);
  }

  /** Cho toi khi co suat goi nha cung cap. */
  async acquire(kind: TrafficKind) {
    for (;;) {
      const waitMs = await this.tryAcquire(kind);
      if (waitMs === 0) return;
      await new Promise((r) => setTimeout(r, waitMs + Math.random() * 5));
    }
  }
}

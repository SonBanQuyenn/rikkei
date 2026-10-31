import { Injectable } from '@nestjs/common';

/**
 * Bo dem cua so co dinh, khoa = "<chu the>:<ten han muc>:<so thu tu cua so>".
 * Moi cua so co thoi diem het han rieng; cac khoa da het han duoc don dinh ky.
 * Moi truong that: thay bang Redis (INCR + PEXPIRE trong mot script Lua de nhieu instance dung chung).
 */
@Injectable()
export class CounterStore {
  private counters = new Map<string, { count: number; expiresAt: number }>();

  get(key: string, now: number): number {
    const c = this.counters.get(key);
    return c && c.expiresAt > now ? c.count : 0;
  }

  increment(key: string, expiresAt: number, now: number): number {
    const c = this.counters.get(key);
    if (!c || c.expiresAt <= now) {
      this.counters.set(key, { count: 1, expiresAt });
      return 1;
    }
    return ++c.count;
  }

  sweep(now: number) {
    for (const [key, c] of this.counters) if (c.expiresAt <= now) this.counters.delete(key);
  }
}

import { Injectable } from '@nestjs/common';

/**
 * Tang luu tru bo dem cua la chan. Chinh sach chi phu thuoc giao dien nay,
 * nen co the thay MemoryShieldStore bang Redis khi chay nhieu instance.
 */
export abstract class ShieldStore {
  /** Ghi nhan mot lan truy cap, tra ve so lan trong cua so truot `windowMs` (tinh ca lan nay). */
  abstract hit(key: string, now: number, windowMs: number): number;
  /** Them `member` vao tap hop, tra ve so phan tu khac nhau con trong cua so `windowMs`. */
  abstract addDistinct(key: string, member: string, now: number, windowMs: number): number;
  abstract put<T>(key: string, value: T, now: number, ttlMs: number): void;
  abstract get<T>(key: string, now: number): T | undefined;
  abstract delete(key: string): void;
  abstract sweep(now: number): void;
}

@Injectable()
export class MemoryShieldStore extends ShieldStore {
  private hits = new Map<string, number[]>();
  private sets = new Map<string, Map<string, number>>();
  private values = new Map<string, { value: unknown; expiresAt: number }>();

  hit(key: string, now: number, windowMs: number): number {
    const times = (this.hits.get(key) ?? []).filter((t) => now - t < windowMs);
    times.push(now);
    this.hits.set(key, times);
    return times.length;
  }

  addDistinct(key: string, member: string, now: number, windowMs: number): number {
    const members = this.sets.get(key) ?? new Map<string, number>();
    for (const [m, seenAt] of members) if (now - seenAt >= windowMs) members.delete(m);
    members.set(member, now);
    this.sets.set(key, members);
    return members.size;
  }

  put<T>(key: string, value: T, now: number, ttlMs: number) {
    this.values.set(key, { value, expiresAt: now + ttlMs });
  }

  get<T>(key: string, now: number): T | undefined {
    const entry = this.values.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.values.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  delete(key: string) {
    this.values.delete(key);
  }

  /** Don du lieu het han de bo nho khong phinh theo thoi gian (cua so dai nhat: 1 gio). */
  sweep(now: number) {
    const maxWindow = 60 * 60_000;
    for (const [key, times] of this.hits) if (!times.length || now - times[times.length - 1] >= maxWindow) this.hits.delete(key);
    for (const [key, members] of this.sets) {
      for (const [m, seenAt] of members) if (now - seenAt >= maxWindow) members.delete(m);
      if (!members.size) this.sets.delete(key);
    }
    for (const [key, entry] of this.values) if (entry.expiresAt <= now) this.values.delete(key);
  }
}

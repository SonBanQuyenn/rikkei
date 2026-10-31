import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { RequestContext, Verdict } from '../shield.types.js';

export interface BlockLogEntry {
  id: string;
  at: string;
  requestId: string;
  layer: Verdict['layer'];
  rule: string;
  observed: Verdict['observed'];
  threshold: Verdict['threshold'];
  action: 'challenge';
  challengeId: string;
  path: string;
  ip: string;
  deviceId: string;
  userId?: string;
  productId?: string;
  /** null = chua ro; 'challenge-solved' / 'manual' = da xac nhan la chan nham */
  falsePositive: null | 'challenge-solved' | 'manual';
}

const MAX_ENTRIES = 10_000;

/**
 * Nhat ky moi lan chan: du thong tin de doi van hanh truy vet (ai, o dau, lop nao,
 * gia tri do duoc bao nhieu so voi nguong nao) va dieu chinh nguong.
 * Ghi ra stdout dang JSON (dua vao ELK/Loki) va giu ban sao gan nhat trong bo nho de tra cuu nhanh.
 */
@Injectable()
export class BlockLogService {
  private readonly logger = new Logger('ShieldBlock');
  private entries: BlockLogEntry[] = [];
  private seq = 0;

  record(ctx: RequestContext, verdict: Verdict, challengeId: string): BlockLogEntry {
    const entry: BlockLogEntry = {
      id: `blk-${++this.seq}`,
      at: new Date(ctx.now).toISOString(),
      requestId: ctx.requestId,
      layer: verdict.layer,
      rule: verdict.rule,
      observed: verdict.observed,
      threshold: verdict.threshold,
      action: 'challenge',
      challengeId,
      path: ctx.path,
      ip: ctx.ip,
      deviceId: ctx.deviceId,
      userId: ctx.userId,
      productId: ctx.productId,
      falsePositive: null,
    };
    this.entries.push(entry);
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES);
    this.logger.warn(JSON.stringify(entry));
    return entry;
  }

  markFalsePositive(id: string, source: 'challenge-solved' | 'manual'): BlockLogEntry {
    const entry = this.entries.find((e) => e.id === id);
    if (!entry) throw new NotFoundException(`Khong tim thay ban ghi chan ${id}`);
    if (!entry.falsePositive) {
      entry.falsePositive = source;
      this.logger.log(JSON.stringify({ event: 'false_positive', id, source, layer: entry.layer, rule: entry.rule }));
    }
    return entry;
  }

  query(filter: { layer?: string; deviceId?: string; userId?: string; limit?: number }) {
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 500);
    return this.entries
      .filter((e) => (!filter.layer || e.layer === filter.layer) && (!filter.deviceId || e.deviceId === filter.deviceId) && (!filter.userId || e.userId === filter.userId))
      .slice(-limit)
      .reverse();
  }

  all(): readonly BlockLogEntry[] {
    return this.entries;
  }
}

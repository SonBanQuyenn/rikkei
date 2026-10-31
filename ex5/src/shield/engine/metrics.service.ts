import { Injectable } from '@nestjs/common';
import type { LayerName } from '../shield.types.js';
import { BlockLogService } from './block-log.service.js';

const LAYERS: LayerName[] = ['velocity', 'behavior', 'account-farm'];

/**
 * Do luong de bao cao ti le chan nham.
 * Chan nham = lan chan ma sau do duoc xac nhan la nguoi that:
 *   - nguoi dung giai duoc thu thach (bot tu dong khong giai), hoac
 *   - CSKH danh dau thu cong khi khach khieu nai.
 */
@Injectable()
export class MetricsService {
  private requests = 0;
  private passedWithToken = 0;
  private policyErrors = 0;

  constructor(private readonly blockLog: BlockLogService) {}

  countRequest() {
    this.requests++;
  }

  countPassWithToken() {
    this.passedWithToken++;
  }

  countPolicyError() {
    this.policyErrors++;
  }

  report() {
    const entries = this.blockLog.all();
    const byLayer = LAYERS.map((layer) => {
      const blocks = entries.filter((e) => e.layer === layer);
      const falsePositives = blocks.filter((e) => e.falsePositive).length;
      return {
        layer,
        blocked: blocks.length,
        falsePositives,
        falsePositiveRate: rate(falsePositives, blocks.length),
      };
    });
    const blocked = entries.length;
    const falsePositives = entries.filter((e) => e.falsePositive).length;
    return {
      requests: this.requests,
      blocked,
      blockRate: rate(blocked, this.requests),
      falsePositives,
      /** Ti le chan nham tren tong so lan chan */
      falsePositiveRate: rate(falsePositives, blocked),
      passedWithChallengeToken: this.passedWithToken,
      policyErrors: this.policyErrors,
      byLayer,
    };
  }
}

const rate = (part: number, total: number) => (total === 0 ? 0 : Math.round((part / total) * 10_000) / 10_000);

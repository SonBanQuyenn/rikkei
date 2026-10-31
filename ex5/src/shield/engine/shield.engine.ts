import { Inject, Injectable, Logger } from '@nestjs/common';
import { PolicyConfigStore } from '../config/policy-config.store.js';
import type { ShieldPolicy } from '../policies/policy.js';
import type { RequestContext, Verdict } from '../shield.types.js';
import { ShieldStore } from '../storage/shield-store.js';
import { BlockLogService } from './block-log.service.js';
import { ChallengeService } from './challenge.service.js';
import { MetricsService } from './metrics.service.js';

export const SHIELD_POLICIES = Symbol('SHIELD_POLICIES');

export type InspectResult =
  | { allowed: true }
  | { allowed: false; verdict: Verdict; challenge: { id: string; question: string }; blockId: string };

/**
 * Co che thuc thi: cho request di qua tung lop theo thu tu, lop dau tien phat hien lam dung se quyet dinh.
 * Khong chua quy tac nao - quy tac nam trong cac ShieldPolicy.
 */
@Injectable()
export class ShieldEngine {
  private readonly logger = new Logger('ShieldEngine');

  constructor(
    @Inject(SHIELD_POLICIES) private readonly policies: ShieldPolicy[],
    private readonly config: PolicyConfigStore,
    private readonly store: ShieldStore,
    private readonly challenges: ChallengeService,
    private readonly blockLog: BlockLogService,
    private readonly metrics: MetricsService,
  ) {}

  inspect(ctx: RequestContext): InspectResult {
    this.metrics.countRequest();

    // Da giai thu thach -> duoc mien kiem tra trong thoi gian ngan (nguoi that khong bi hoi lai lien tuc)
    if (this.challenges.isValidPass(ctx.passToken, ctx.deviceId, ctx.now)) {
      this.metrics.countPassWithToken();
      return { allowed: true };
    }

    const config = this.config.get();
    for (const policy of this.policies) {
      if (!policy.isEnabled(config) || !policy.appliesTo(ctx.action)) continue;

      let verdict: Verdict | null;
      try {
        verdict = policy.evaluate(ctx, config, this.store);
      } catch (err) {
        // Mot lop hong (vd kho dem mat ket noi) KHONG duoc chan khach that: bo qua lop do, ghi loi
        this.metrics.countPolicyError();
        this.logger.error(JSON.stringify({ event: 'policy_error', layer: policy.layer, requestId: ctx.requestId, error: String(err) }));
        continue;
      }
      if (!verdict) continue;

      const challengeId = `chl-${ctx.requestId}`;
      const entry = this.blockLog.record(ctx, verdict, challengeId);
      const challenge = this.challenges.issue(ctx.deviceId, entry.id, challengeId);
      return { allowed: false, verdict, challenge, blockId: entry.id };
    }
    return { allowed: true };
  }
}

import type { PolicyConfig } from '../config/policy-config.js';
import type { ShieldStore } from '../storage/shield-store.js';
import type { RequestContext, ShieldAction, Verdict } from '../shield.types.js';
import type { ShieldPolicy } from './policy.js';

/** Dau vet mot lan xem trang san pham, do ViewTokenService ghi. */
export interface ViewRecord {
  deviceId: string;
  productId: string;
  viewedAt: number;
}

export const viewTokenKey = (token: string) => `view:${token}`;

/**
 * Lop 2 - Hanh vi: chan bot goi thang API dat hang ma khong qua trang san pham,
 * hoac dat nhanh hon kha nang cua nguoi that (mo trang -> doc -> bam dat).
 */
export class BehaviorPolicy implements ShieldPolicy {
  readonly layer = 'behavior' as const;

  isEnabled(config: PolicyConfig) {
    return config.behavior.enabled;
  }

  appliesTo(action: ShieldAction) {
    return action === 'order';
  }

  evaluate(ctx: RequestContext, config: PolicyConfig, store: ShieldStore): Verdict | null {
    const { minViewToOrderMs } = config.behavior;
    const record = ctx.viewToken ? store.get<ViewRecord>(viewTokenKey(ctx.viewToken), ctx.now) : undefined;

    if (!record || record.deviceId !== ctx.deviceId || record.productId !== ctx.productId) {
      return {
        layer: this.layer,
        rule: 'missing-view',
        observed: ctx.viewToken ? 'view token khong hop le' : 'khong co view token',
        threshold: 'phai mo trang san pham truoc khi dat',
        status: 403,
        message: 'Không xác định được lượt xem sản phẩm trước khi đặt. Vui lòng xác minh để tiếp tục.',
      };
    }

    const elapsed = ctx.now - record.viewedAt;
    if (elapsed < minViewToOrderMs) {
      return {
        layer: this.layer,
        rule: 'too-fast',
        observed: elapsed,
        threshold: minViewToOrderMs,
        status: 403,
        message: `Đơn được đặt sau ${elapsed}ms kể từ lúc mở trang, nhanh hơn thao tác thông thường. Vui lòng xác minh để tiếp tục.`,
      };
    }
    return null;
  }
}

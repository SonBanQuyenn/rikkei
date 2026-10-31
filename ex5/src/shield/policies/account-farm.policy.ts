import type { PolicyConfig } from '../config/policy-config.js';
import type { ShieldStore } from '../storage/shield-store.js';
import type { RequestContext, ShieldAction, Verdict } from '../shield.types.js';
import type { ShieldPolicy } from './policy.js';

/**
 * Lop 3 - Danh tinh: chan mot thiet bi xoay vong nhieu tai khoan (nick ao)
 * de vuot gioi han mua tren moi tai khoan.
 */
export class AccountFarmPolicy implements ShieldPolicy {
  readonly layer = 'account-farm' as const;

  isEnabled(config: PolicyConfig) {
    return config.accountFarm.enabled;
  }

  appliesTo(action: ShieldAction) {
    return action === 'order';
  }

  evaluate(ctx: RequestContext, config: PolicyConfig, store: ShieldStore): Verdict | null {
    if (!ctx.userId) return null; // chua dang nhap -> tang nghiep vu se tu choi
    const { windowMs, maxAccountsPerDevice } = config.accountFarm;
    const accounts = store.addDistinct(`farm:device:${ctx.deviceId}`, ctx.userId, ctx.now, windowMs);
    if (accounts <= maxAccountsPerDevice) return null;
    return {
      layer: this.layer,
      rule: 'accounts-per-device',
      observed: accounts,
      threshold: maxAccountsPerDevice,
      status: 403,
      message: `Thiết bị này đã đặt hàng bằng ${accounts} tài khoản khác nhau trong ${windowMs / 60_000} phút (tối đa ${maxAccountsPerDevice}). Vui lòng xác minh để tiếp tục.`,
    };
  }
}

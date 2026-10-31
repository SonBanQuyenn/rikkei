import type { PolicyConfig } from '../config/policy-config.js';
import type { ShieldStore } from '../storage/shield-store.js';
import type { RequestContext, Verdict } from '../shield.types.js';
import type { ShieldPolicy } from './policy.js';

/**
 * Lop 1 - Toc do: chan bot ban don dap (lam moi trang, spam nut dat hang).
 * Dem theo THIET BI va theo IP trong cua so truot.
 */
export class VelocityPolicy implements ShieldPolicy {
  readonly layer = 'velocity' as const;

  isEnabled(config: PolicyConfig) {
    return config.velocity.enabled;
  }

  appliesTo() {
    return true;
  }

  evaluate(ctx: RequestContext, config: PolicyConfig, store: ShieldStore): Verdict | null {
    const { windowMs, maxPerDevice, maxPerIp } = config.velocity;
    const perDevice = store.hit(`velocity:device:${ctx.deviceId}`, ctx.now, windowMs);
    const perIp = store.hit(`velocity:ip:${ctx.ip}`, ctx.now, windowMs);
    const seconds = windowMs / 1000;

    if (perDevice > maxPerDevice) {
      return {
        layer: this.layer,
        rule: 'device-rate',
        observed: perDevice,
        threshold: maxPerDevice,
        status: 429,
        message: `Thiết bị gửi ${perDevice} yêu cầu trong ${seconds} giây (tối đa ${maxPerDevice}). Vui lòng xác minh bạn không phải robot.`,
      };
    }
    if (perIp > maxPerIp) {
      return {
        layer: this.layer,
        rule: 'ip-rate',
        observed: perIp,
        threshold: maxPerIp,
        status: 429,
        message: `Mạng của bạn gửi ${perIp} yêu cầu trong ${seconds} giây (tối đa ${maxPerIp}). Vui lòng xác minh bạn không phải robot.`,
      };
    }
    return null;
  }
}

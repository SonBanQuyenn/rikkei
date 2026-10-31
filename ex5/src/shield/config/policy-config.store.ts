import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DEFAULT_POLICY_CONFIG, type PolicyConfig } from './policy-config.js';

type Section = keyof PolicyConfig;

/**
 * Giu nguong dang ap dung. Moi request doc cau hinh tai thoi diem do,
 * nen thay doi co hieu luc ngay ma khong can khoi dong lai dich vu.
 */
@Injectable()
export class PolicyConfigStore {
  private readonly logger = new Logger('ShieldPolicy');
  private config: PolicyConfig = structuredClone(DEFAULT_POLICY_CONFIG);

  get(): Readonly<PolicyConfig> {
    return this.config;
  }

  /** Cap nhat mot phan. Kiem tra toan bo truoc, sai mot truong thi khong ap dung gi. */
  update(patch: unknown, actor = 'admin'): PolicyConfig {
    if (!isObject(patch)) throw new BadRequestException('Body phai la object, vd { "velocity": { "maxPerDevice": 30 } }');
    const next = structuredClone(this.config);
    const errors: string[] = [];

    for (const [section, values] of Object.entries(patch)) {
      if (!(section in next)) {
        errors.push(`Khong co nhom cau hinh "${section}"`);
        continue;
      }
      if (!isObject(values)) {
        errors.push(`"${section}" phai la object`);
        continue;
      }
      const target = next[section as Section] as Record<string, unknown>;
      for (const [field, value] of Object.entries(values)) {
        const path = `${section}.${field}`;
        if (!(field in target)) errors.push(`Khong co truong "${path}"`);
        else if (typeof target[field] === 'boolean' && typeof value !== 'boolean') errors.push(`"${path}" phai la true/false`);
        else if (typeof target[field] === 'number' && !(Number.isInteger(value) && (value as number) > 0)) errors.push(`"${path}" phai la so nguyen duong`);
        else target[field] = value;
      }
    }
    if (errors.length) throw new BadRequestException(errors);

    this.logger.log(JSON.stringify({ event: 'policy_updated', actor, patch, at: new Date().toISOString() }));
    this.config = next;
    return next;
  }

  reset() {
    this.config = structuredClone(DEFAULT_POLICY_CONFIG);
  }
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

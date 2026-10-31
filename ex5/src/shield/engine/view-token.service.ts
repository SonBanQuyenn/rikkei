import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Clock } from '../clock.js';
import { PolicyConfigStore } from '../config/policy-config.store.js';
import { type ViewRecord, viewTokenKey } from '../policies/behavior.policy.js';
import { ShieldStore } from '../storage/shield-store.js';

/** Cap ma xem trang khi khach mo trang san pham; lop Hanh vi doi chieu ma nay luc dat don. */
@Injectable()
export class ViewTokenService {
  constructor(
    private readonly store: ShieldStore,
    private readonly config: PolicyConfigStore,
    private readonly clock: Clock,
  ) {}

  issue(deviceId: string, productId: string): string {
    const token = `vt-${randomBytes(12).toString('hex')}`;
    const now = this.clock.now();
    this.store.put<ViewRecord>(viewTokenKey(token), { deviceId, productId, viewedAt: now }, now, this.config.get().behavior.viewTokenTtlMs);
    return token;
  }
}

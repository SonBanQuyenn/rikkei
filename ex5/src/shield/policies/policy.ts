import type { PolicyConfig } from '../config/policy-config.js';
import type { ShieldStore } from '../storage/shield-store.js';
import type { LayerName, RequestContext, ShieldAction, Verdict } from '../shield.types.js';

/**
 * Mot lop phong thu: chi chua QUY TAC (khi nao la lam dung).
 * Khong biet gi ve HTTP, log, thu thach hay cach luu tru cu the.
 */
export interface ShieldPolicy {
  readonly layer: LayerName;
  isEnabled(config: PolicyConfig): boolean;
  appliesTo(action: ShieldAction): boolean;
  evaluate(ctx: RequestContext, config: PolicyConfig, store: ShieldStore): Verdict | null;
}

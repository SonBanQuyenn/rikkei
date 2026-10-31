import { Injectable } from '@nestjs/common';
import { CounterStore } from './counter.store.js';
import { DAY, EXPENSIVE_LIMIT, MINUTE, PLANS, type PlanName } from './plans.js';

export type RuleName = 'minute' | 'day' | 'report-hour';

export interface RuleState {
  name: RuleName;
  /** null = khong gioi han */
  limit: number | null;
  remaining: number | null;
  resetAt: number | null;
}

export interface QuotaDecision {
  allowed: boolean;
  plan: PlanName;
  rules: RuleState[];
  /** Han muc lam request bi chan (neu co) */
  violated?: RuleState;
  retryAfterMs?: number;
}

interface Rule {
  name: RuleName;
  limit: number;
  windowMs: number;
}

/** Ngay tinh theo gio Viet Nam (UTC+7): han muc ngay reset luc 00:00 gio VN. */
const DAY_OFFSET_MS = 7 * 60 * 60_000;

@Injectable()
export class QuotaService {
  constructor(private readonly counters: CounterStore) {}

  /**
   * Kiem tra dong thoi moi tang han muc ap dung cho request.
   * Chi khi TAT CA con suat moi tang bo dem -> request bi chan khong lam hao han muc ngay.
   */
  consume(subject: string, plan: PlanName, expensive: boolean, now: number): QuotaDecision {
    const rules = this.rulesFor(plan, expensive);
    const states = rules.map((rule) => {
      const { key, resetAt } = this.window(subject, rule, now);
      return { rule, key, resetAt, used: this.counters.get(key, now) };
    });

    const violated = states.filter((s) => s.used >= s.rule.limit);
    if (violated.length > 0) {
      // Phai cho toi khi MOI tang dang vuot duoc giai phong
      const blocking = violated.reduce((a, b) => (b.resetAt > a.resetAt ? b : a));
      const rulesView = states.map((s) => this.view(s.rule, s.used, s.resetAt));
      return {
        allowed: false,
        plan,
        rules: this.withUnlimitedDay(plan, rulesView),
        violated: this.view(blocking.rule, blocking.used, blocking.resetAt),
        retryAfterMs: blocking.resetAt - now,
      };
    }

    const rulesView = states.map((s) => {
      const used = this.counters.increment(s.key, s.resetAt, now);
      return this.view(s.rule, used, s.resetAt);
    });
    return { allowed: true, plan, rules: this.withUnlimitedDay(plan, rulesView) };
  }

  private rulesFor(plan: PlanName, expensive: boolean): Rule[] {
    const limits = PLANS[plan];
    const rules: Rule[] = [{ name: 'minute', limit: limits.perMinute, windowMs: MINUTE }];
    if (limits.perDay !== null) rules.push({ name: 'day', limit: limits.perDay, windowMs: DAY });
    if (expensive) rules.push({ name: 'report-hour', limit: EXPENSIVE_LIMIT.limit, windowMs: EXPENSIVE_LIMIT.windowMs });
    return rules;
  }

  private window(subject: string, rule: Rule, now: number) {
    const offset = rule.name === 'day' ? DAY_OFFSET_MS : 0;
    const index = Math.floor((now + offset) / rule.windowMs);
    return { key: `${subject}:${rule.name}:${index}`, resetAt: (index + 1) * rule.windowMs - offset };
  }

  private view(rule: Rule, used: number, resetAt: number): RuleState {
    return { name: rule.name, limit: rule.limit, remaining: Math.max(0, rule.limit - used), resetAt };
  }

  /** Goi Enterprise van hien tieu de han muc ngay la "unlimited" de nha ban hang biet ro. */
  private withUnlimitedDay(plan: PlanName, rules: RuleState[]): RuleState[] {
    if (PLANS[plan].perDay !== null) return rules;
    return [rules[0], { name: 'day', limit: null, remaining: null, resetAt: null }, ...rules.slice(1)];
  }
}

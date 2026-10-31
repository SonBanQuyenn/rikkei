import { type CanActivate, type ExecutionContext, HttpException, HttpStatus, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Clock } from './clock.js';
import { MerchantStore } from './merchant.store.js';
import { LOWEST_PLAN } from './plans.js';
import { type QuotaDecision, QuotaService, type RuleName } from './quota.service.js';

const EXPENSIVE = 'quota:expensive';
/** Danh dau endpoint ton tai nguyen (them han muc 10 request / gio). */
export const ExpensiveEndpoint = () => SetMetadata(EXPENSIVE, true);

const HEADER_SUFFIX: Record<RuleName, string> = { minute: 'Minute', day: 'Day', 'report-hour': 'Report-Hour' };

const RULE_LABEL: Record<RuleName, string> = {
  minute: 'theo phút',
  day: 'theo ngày',
  'report-hour': 'xuất báo cáo tồn kho theo giờ',
};

/** Thong bao cho request khong duoc huong goi cuoc (header chi chap nhan ky tu ASCII). */
const KEY_NOTICE = {
  missing: {
    header: 'Missing X-API-Key: request is limited at the lowest tier (free) by IP',
    body: 'Thiếu khoá API (header X-API-Key): request được tính ở hạn mức thấp nhất (gói Free) theo địa chỉ IP.',
  },
  unknown: {
    header: 'Invalid X-API-Key: request is limited at the lowest tier (free) by IP',
    body: 'Khoá API không tồn tại: request được tính ở hạn mức thấp nhất (gói Free) theo địa chỉ IP.',
  },
  revoked: {
    header: 'Revoked X-API-Key: request is limited at the lowest tier (free) by IP',
    body: 'Khoá API đã bị thu hồi: request không còn được hưởng gói cước của nhà bán hàng, chỉ được tính ở hạn mức thấp nhất (gói Free) theo địa chỉ IP. Vui lòng tạo khoá mới.',
  },
} as const;

@Injectable()
export class QuotaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly merchants: MerchantStore,
    private readonly quota: QuotaService,
    private readonly clock: Clock,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const expensive = this.reflector.getAllAndOverride<boolean>(EXPENSIVE, [context.getHandler(), context.getClass()]) ?? false;
    const now = this.clock.now();

    // 1. Dinh danh: khoa hop le -> theo nha ban hang + goi hien tai; con lai -> theo IP + goi thap nhat
    const header = req.header('x-api-key');
    const resolution = this.merchants.resolveKey(header);
    let subject: string;
    let notice: (typeof KEY_NOTICE)[keyof typeof KEY_NOTICE] | undefined;
    let decision: QuotaDecision;
    if (resolution.status === 'valid') {
      subject = `merchant:${resolution.merchant.id}`;
      decision = this.quota.consume(subject, resolution.merchant.plan, expensive, now);
    } else {
      subject = `anon:${req.ip}`;
      notice = KEY_NOTICE[resolution.status];
      decision = this.quota.consume(subject, LOWEST_PLAN, expensive, now);
    }

    // 2. Luon tra tieu de han muc - ca khi cho qua lan khi chan
    this.setHeaders(res, decision, now);
    if (notice) res.setHeader('X-RateLimit-Notice', notice.header);

    if (decision.allowed) return true;

    // 3. Chan: thong bao ro han muc nao, con bao lau
    const violated = decision.violated!;
    const retryAfter = Math.ceil(decision.retryAfterMs! / 1000);
    res.setHeader('Retry-After', retryAfter);
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        message:
          `Đã dùng hết hạn mức ${RULE_LABEL[violated.name]} của gói ${decision.plan.toUpperCase()} ` +
          `(${violated.limit} request). Vui lòng thử lại sau ${retryAfter} giây.` +
          (notice ? ` ${notice.body}` : ''),
        plan: decision.plan,
        limit: violated.name,
        retryAfterSeconds: retryAfter,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private setHeaders(res: Response, decision: QuotaDecision, now: number) {
    res.setHeader('X-RateLimit-Plan', decision.plan);
    for (const rule of decision.rules) {
      const suffix = HEADER_SUFFIX[rule.name];
      res.setHeader(`X-RateLimit-Limit-${suffix}`, rule.limit ?? 'unlimited');
      res.setHeader(`X-RateLimit-Remaining-${suffix}`, rule.remaining ?? 'unlimited');
      if (rule.resetAt !== null) res.setHeader(`X-RateLimit-Reset-${suffix}`, Math.ceil((rule.resetAt - now) / 1000));
    }
  }
}

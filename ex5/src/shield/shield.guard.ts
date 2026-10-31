import { type CanActivate, type ExecutionContext, HttpException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { randomUUID } from 'node:crypto';
import { Clock } from './clock.js';
import { ShieldEngine } from './engine/shield.engine.js';
import type { RequestContext, ShieldAction } from './shield.types.js';

const SHIELD_ACTION = 'shield:action';
/** Danh dau route duoc la chan bao ve. */
export const Shielded = (action: ShieldAction) => SetMetadata(SHIELD_ACTION, action);

/** Adapter HTTP: doc request -> RequestContext -> hoi ShieldEngine -> tra 403/429 kem thu thach. */
@Injectable()
export class ShieldGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly engine: ShieldEngine,
    private readonly clock: Clock,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const action = this.reflector.get<ShieldAction | undefined>(SHIELD_ACTION, context.getHandler());
    if (!action) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const ctx = buildContext(req, action, this.clock.now());
    (req as Request & { shield?: RequestContext }).shield = ctx;

    const result = this.engine.inspect(ctx);
    if (result.allowed) return true;

    throw new HttpException(
      {
        statusCode: result.verdict.status,
        code: 'CHALLENGE_REQUIRED',
        message: result.verdict.message,
        layer: result.verdict.layer,
        rule: result.verdict.rule,
        requestId: ctx.requestId,
        challenge: {
          ...result.challenge,
          solveUrl: `/shield/challenges/${result.challenge.id}/solve`,
          hint: 'Giai xong, gui lai request voi header X-Challenge-Pass',
        },
      },
      result.verdict.status,
    );
  }
}

export function buildContext(req: Request, action: ShieldAction, now: number): RequestContext {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const header = (name: string) => {
    const v = req.header(name);
    return typeof v === 'string' && v.trim() ? v.trim().slice(0, 128) : undefined;
  };
  const body = (req.body ?? {}) as Record<string, unknown>;
  const productId = typeof req.params?.id === 'string' ? req.params.id : undefined;
  return {
    requestId: randomUUID(),
    action,
    ip,
    // Thieu ma thiet bi -> gom theo IP de khong ne duoc lop Toc do bang cach bo header
    deviceId: header('x-device-id') ?? `ip:${ip}`,
    userId: header('x-user-id'),
    productId,
    viewToken: typeof body.viewToken === 'string' ? body.viewToken : undefined,
    passToken: header('x-challenge-pass'),
    path: req.originalUrl ?? req.url,
    now,
  };
}

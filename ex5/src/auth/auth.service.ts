import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DISPATCH_CONFIG, type DispatchConfig } from '../config.js';
import type { AuthUser } from '../contracts/events.js';

/** Danh ba nguoi dung gia lap (thuc te lay tu DB / dich vu dang nhap). */
export const USERS: Record<string, AuthUser> = {
  C01: { id: 'C01', name: 'Khach An', role: 'customer' },
  C02: { id: 'C02', name: 'Khach Binh', role: 'customer' },
  D01: { id: 'D01', name: 'Tai xe Cuong', role: 'driver' },
  D02: { id: 'D02', name: 'Tai xe Dung', role: 'driver' },
  OP01: { id: 'OP01', name: 'Dieu phoi Ha', role: 'dispatcher' },
};

export class AuthError extends Error {}

/** Token dang `<base64url(json)>.<hmac>`, co han dung. */
@Injectable()
export class AuthService {
  constructor(@Inject(DISPATCH_CONFIG) private readonly config: DispatchConfig) {}

  issue(userId: string, ttlMs = 8 * 3600_000): string {
    const user = USERS[userId];
    if (!user) throw new AuthError('Nguoi dung khong ton tai');
    const body = Buffer.from(JSON.stringify({ sub: user.id, role: user.role, exp: Date.now() + ttlMs })).toString(
      'base64url',
    );
    return `${body}.${this.sign(body)}`;
  }

  verify(token: unknown): AuthUser {
    if (typeof token !== 'string' || !token.includes('.')) throw new AuthError('Thieu token');
    const [body, sig] = token.split('.');
    const expected = Buffer.from(this.sign(body));
    const given = Buffer.from(sig ?? '');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) throw new AuthError('Token khong hop le');

    let claims: { sub?: string; role?: string; exp?: number };
    try {
      claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    } catch {
      throw new AuthError('Token khong hop le');
    }
    if (!claims.exp || claims.exp < Date.now()) throw new AuthError('Token het han');
    const user = claims.sub ? USERS[claims.sub] : undefined;
    if (!user || user.role !== claims.role) throw new AuthError('Token khong hop le');
    return user;
  }

  private sign(body: string) {
    return createHmac('sha256', this.config.tokenSecret).update(body).digest('base64url');
  }
}

import { createHmac, timingSafeEqual } from 'crypto';

// Token don gian dang "<userId>.<expiresAt>.<chu ky HMAC>" ky bang JWT_SECRET
// (JWT_SECRET duoc nen tang cap luc chay, khong nam trong ma nguon).
export function signToken(userId: string, secret: string, ttlSeconds = 3600, now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + ttlSeconds;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyToken(token: string, secret: string, now = Date.now()): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, expiresAt, signature] = parts;
  const expected = Buffer.from(sign(`${userId}.${expiresAt}`, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (Number(expiresAt) < Math.floor(now / 1000)) return null;
  return userId;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

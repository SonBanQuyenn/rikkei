import type { User } from './chat/contracts.js';

/** Token gia lap - thuc te se la JWT do he thong dang nhap cap. */
export const USERS_BY_TOKEN: Record<string, User> = {
  'tk-c01': { id: 'C01', name: 'Khach An', role: 'customer' },
  'tk-c02': { id: 'C02', name: 'Khach Binh', role: 'customer' },
  'tk-a01': { id: 'A01', name: 'CSKH Lan', role: 'agent' },
  'tk-a02': { id: 'A02', name: 'CSKH Minh', role: 'agent' },
};

export function authenticate(token: unknown): User | null {
  return typeof token === 'string' ? (USERS_BY_TOKEN[token] ?? null) : null;
}

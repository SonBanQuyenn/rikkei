import type { QueueKey } from '../config/queues.config.js';
import type { Ports } from './ports.js';

export class InvalidPayloadError extends Error {}

export type TaskContext = {
  ports: Ports;
  /** Bao tien do (0-100) cho viec dai - hien tren bang dieu khien. */
  progress(pct: number): Promise<void>;
};

/** Mot loai tac vu nghiep vu: thuoc hang doi nao, khoa chong lap la gi, lam gi. */
export interface TaskDefinition<T = unknown> {
  readonly name: string;
  readonly queue: QueueKey;
  /** Kiem tra du lieu dau vao; sai -> InvalidPayloadError (khong thu lai). */
  parse(data: unknown): T;
  /** Khoa nghiep vu: hai job cung khoa chi tao tac dung phu mot lan. */
  idempotencyKey(data: T): string;
  run(data: T, ctx: TaskContext): Promise<unknown>;
}

export function requireFields<T extends object>(data: unknown, fields: (keyof T)[]): T {
  if (!data || typeof data !== 'object') throw new InvalidPayloadError('Du lieu job khong phai object');
  for (const f of fields) {
    if ((data as Record<string, unknown>)[f as string] === undefined) throw new InvalidPayloadError(`Thieu truong ${String(f)}`);
  }
  return data as T;
}

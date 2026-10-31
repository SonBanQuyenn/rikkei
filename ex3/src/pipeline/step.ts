import type { Order, OrderStatus, StepName } from '../domain/order.js';
import type { OrderRepository } from '../domain/order.repository.js';
import type { Integrations } from '../integrations/contracts.js';

export type StepContext = {
  deps: Integrations;
  repo: OrderRepository;
  paymentTimeoutMs: number;
};

/** Ket qua cua mot buoc -> trang thai don moi. Trang thai ket thuc thi day chuyen dung, nguoc lai sang buoc ke. */
export type StepResult = { status: OrderStatus; note: string; patch?: Partial<Order> };

export interface StepHandler {
  readonly name: StepName;
  /** Thao tac chinh. Nem loi -> duoc thu lai theo cau hinh cua buoc. Phai idempotent: co the bi chay lai. */
  run(order: Order, ctx: StepContext): Promise<StepResult>;
  /** Chay khi loi nghiep vu chac chan (PermanentError) hoac da het so lan thu: nhanh re khi that bai. */
  onFinalFailure(order: Order, error: Error, ctx: StepContext): Promise<StepResult>;
}

export class GatewayTimeoutError extends Error {}

export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new GatewayTimeoutError(`${what}: het ${ms} ms khong phan hoi`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

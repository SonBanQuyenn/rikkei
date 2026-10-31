import { PaymentDeclinedError, type Order } from '../../domain/order.js';
import type { PaymentRecord } from '../../integrations/contracts.js';
import { withTimeout, type StepContext, type StepHandler, type StepResult } from '../step.js';

/** Moi don chi co MOT khoa thanh toan, dung chung cho moi lan thu va moi tien trinh. */
export const paymentKey = (orderId: string) => `pay-${orderId}`;

const paid = (rec: PaymentRecord, note: string): StepResult => ({
  status: 'PAID',
  note,
  patch: { payment: { status: 'CAPTURED', transactionId: rec.transactionId } },
});

/**
 * Buoc 2 - xac nhan thanh toan. Chong tru tien hai lan:
 *  1. Truoc khi tru, tra cuu cong theo khoa cua don: lan truoc da tru (nhung phan hoi bi mat) -> dung ket qua cu.
 *  2. Lenh tru gui kem cung khoa idempotency -> neu cong ho tro, cong tu chan lan tru thu hai.
 *  3. Het thoi gian cho KHONG coi la that bai: nem loi tam thoi, lan thu sau quay lai buoc 1.
 *  4. Truoc khi huy don vi het so lan thu, tra cuu lan cuoi - khong bao gio huy mot don da bi tru tien.
 */
export const confirmPaymentStep: StepHandler = {
  name: 'confirm-payment',

  async run(order: Order, { deps, paymentTimeoutMs }: StepContext) {
    const key = paymentKey(order.id);

    const previous = await deps.payment.getPayment(key);
    if (previous?.status === 'captured') return paid(previous, `Thanh toan da duoc tru o lan thu truoc (${previous.transactionId}) - khong tru lai`);
    if (previous?.status === 'declined') throw new PaymentDeclinedError('Cong thanh toan tu choi');

    const rec = await withTimeout(
      deps.payment.capture({ orderId: order.id, amount: order.amount, idempotencyKey: key }),
      paymentTimeoutMs,
      'Cong thanh toan',
    );
    if (rec.status === 'declined') throw new PaymentDeclinedError('Cong thanh toan tu choi');
    return paid(rec, `Da xac nhan thanh toan (${rec.transactionId})`);
  },

  async onFinalFailure(order, error, { deps }) {
    const last = await deps.payment.getPayment(paymentKey(order.id));
    if (last?.status === 'captured') return paid(last, `Thanh toan thuc te da thanh cong (${last.transactionId})`);

    await deps.inventory.release(order.id);
    return {
      status: 'CANCELLED',
      note: `Huy don: thanh toan that bai (${error.message}). Da tra hang ve kho`,
      patch: { cancelReason: 'PAYMENT_FAILED' },
    };
  },
};

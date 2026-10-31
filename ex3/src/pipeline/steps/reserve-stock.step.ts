import type { StepHandler } from '../step.js';

/** Buoc 1 - giu hang trong kho. Het hang -> huy don va hoan tien, cac buoc sau khong chay. */
export const reserveStockStep: StepHandler = {
  name: 'reserve-stock',

  async run(order, { deps }) {
    const { reservationId } = await deps.inventory.reserve(order.id, order.items); // idempotent theo orderId
    return { status: 'STOCK_RESERVED', note: `Da giu hang (${reservationId})`, patch: { reservationId } };
  },

  async onFinalFailure(order, error, { deps }) {
    const { refundId } = await deps.payment.refund({ orderId: order.id, idempotencyKey: `refund-${order.id}` });
    return {
      status: 'CANCELLED',
      note: `Huy don: ${error.message}. Da hoan tien (${refundId})`,
      patch: { cancelReason: 'OUT_OF_STOCK', payment: { status: 'REFUNDED', transactionId: refundId } },
    };
  },
};

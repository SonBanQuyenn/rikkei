import type { StepHandler } from '../step.js';

/** Buoc 5 - day don sang doi tac van chuyen (reference = ma don, chong tao van don trung khi thu lai). */
export const pushShippingStep: StepHandler = {
  name: 'push-shipping',

  async run(order, { deps }) {
    const { trackingCode } = await deps.shipping.createShipment({ reference: order.id, items: order.items });
    return { status: 'SHIPPED', note: `Da ban giao van chuyen, ma van don ${trackingCode}`, patch: { shipment: { trackingCode } } };
  },

  async onFinalFailure(order, error, { deps }) {
    const { taskId } = await deps.accounting.createManualTask({ orderId: order.id, kind: 'SHIPPING', reason: error.message });
    return { status: 'SHIPPING_FAILED', note: `Khong day duoc sang van chuyen (${error.message}) - da tao viec cho van hanh (${taskId})` };
  },
};

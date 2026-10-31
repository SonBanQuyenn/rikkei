import type { Order } from '../../domain/order.js';
import type { StepContext, StepHandler } from '../step.js';

/**
 * Buoc 4 - gui email va tin nhan. That bai khong anh huong toi don.
 * Ghi lai tung kenh da gui thanh cong -> thu lai chi gui kenh con thieu, khong gui email lap.
 */
export const notifyCustomerStep: StepHandler = {
  name: 'notify-customer',

  async run(order: Order, { deps, repo }: StepContext) {
    const sent = { ...order.notification };
    if (sent.email !== 'SENT') {
      await deps.notification.sendEmail(order.customer.email, order.id);
      sent.email = 'SENT';
      await repo.patch(order.id, { notification: sent });
    }
    if (sent.sms !== 'SENT') {
      await deps.notification.sendSms(order.customer.phone, order.id);
      sent.sms = 'SENT';
    }
    return { status: 'READY_TO_SHIP', note: 'Da gui email va SMS cho khach', patch: { notification: sent } };
  },

  async onFinalFailure(order, error, { repo }) {
    const current = (await repo.get(order.id)).notification ?? {};
    const notification = {
      email: current.email ?? 'FAILED',
      sms: current.sms ?? 'FAILED',
    } as const;
    return {
      status: 'READY_TO_SHIP',
      note: `Thong bao khach that bai (${error.message}) - khong anh huong don`,
      patch: { notification },
    };
  },
};

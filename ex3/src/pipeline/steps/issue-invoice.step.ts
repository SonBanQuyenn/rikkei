import type { StepHandler } from '../step.js';

/** Buoc 3 - xuat hoa don dien tu. Thu toi da 5 lan; van hong thi bao ke toan xu ly tay, don van di tiep. */
export const issueInvoiceStep: StepHandler = {
  name: 'issue-invoice',

  async run(order, { deps }) {
    const { number } = await deps.einvoice.issue({ orderId: order.id, amount: order.amount });
    return { status: 'INVOICED', note: `Da xuat hoa don ${number}`, patch: { invoice: { status: 'ISSUED', number } } };
  },

  async onFinalFailure(order, error, { deps }) {
    const { taskId } = await deps.accounting.createManualTask({
      orderId: order.id,
      kind: 'E_INVOICE',
      reason: error.message,
    });
    return {
      status: 'INVOICE_MANUAL',
      note: `Xuat hoa don that bai 5 lan (${error.message}) - da bao ke toan (${taskId}), don tiep tuc`,
      patch: { invoice: { status: 'MANUAL', taskId } },
    };
  },
};

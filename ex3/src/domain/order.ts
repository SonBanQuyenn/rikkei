export const STEPS = ['reserve-stock', 'confirm-payment', 'issue-invoice', 'notify-customer', 'push-shipping'] as const;
export type StepName = (typeof STEPS)[number];

export type OrderStatus =
  | 'PLACED' //               vua dat, cho buoc 1
  | 'STOCK_RESERVED' //       xong buoc 1
  | 'PAID' //                 xong buoc 2
  | 'INVOICED' //             xong buoc 3
  | 'INVOICE_MANUAL' //       buoc 3 that bai het 5 lan -> ke toan xu ly tay, don van di tiep
  | 'READY_TO_SHIP' //        xong buoc 4 (du thong bao thanh cong hay khong)
  | 'SHIPPED' //              xong buoc 5 - ket thuc
  | 'SHIPPING_FAILED' //      buoc 5 that bai het so lan thu - can van hanh xu ly
  | 'CANCELLED'; //           huy (het hang / thanh toan that bai)

export const TERMINAL_STATUSES: OrderStatus[] = ['SHIPPED', 'SHIPPING_FAILED', 'CANCELLED'];

export type OrderItem = { sku: string; qty: number };

export type Order = {
  id: string;
  customer: { email: string; phone: string };
  items: OrderItem[];
  amount: number;
  status: OrderStatus;
  completedSteps: StepName[];
  cancelReason?: 'OUT_OF_STOCK' | 'PAYMENT_FAILED';
  reservationId?: string;
  payment?: { status: 'CAPTURED' | 'REFUNDED'; transactionId: string };
  invoice?: { status: 'ISSUED'; number: string } | { status: 'MANUAL'; taskId: string };
  notification?: { email?: 'SENT' | 'FAILED'; sms?: 'SENT' | 'FAILED' };
  shipment?: { trackingCode: string };
  history: { at: string; status: OrderStatus; note: string }[];
};

/** Loi nghiep vu chac chan - thu lai cung vo ich, chay nhanh that bai ngay. */
export class PermanentError extends Error {}
export class OutOfStockError extends PermanentError {}
export class PaymentDeclinedError extends PermanentError {}

import type { OrderItem } from '../domain/order.js';

/** Hop dong voi cac he thong ben ngoai. Moi thao tac co tac dung phu deu nhan khoa idempotency. */

export interface InventoryService {
  /** Giu hang cho don; goi lai voi cung orderId tra ve phieu giu cu. Het hang -> OutOfStockError. */
  reserve(orderId: string, items: OrderItem[]): Promise<{ reservationId: string }>;
  /** Tra hang ve kho; goi lai nhieu lan khong sao. */
  release(orderId: string): Promise<void>;
}

export type PaymentRecord = { status: 'captured' | 'declined'; transactionId: string };

export interface PaymentGateway {
  /** Tru tien. idempotencyKey: cong thanh toan khong tru lan hai cho cung khoa. */
  capture(req: { orderId: string; amount: number; idempotencyKey: string }): Promise<PaymentRecord>;
  /** Tra cuu ket qua theo khoa - dung sau khi bi het thoi gian cho. null = cong chua nhan giao dich nay. */
  getPayment(idempotencyKey: string): Promise<PaymentRecord | null>;
  refund(req: { orderId: string; idempotencyKey: string }): Promise<{ refundId: string }>;
}

export interface EInvoiceService {
  issue(req: { orderId: string; amount: number }): Promise<{ number: string }>;
}

export interface NotificationService {
  sendEmail(to: string, orderId: string): Promise<void>;
  sendSms(to: string, orderId: string): Promise<void>;
}

export interface ShippingPartner {
  /** reference = ma don, doi tac dung de chong tao van don trung. */
  createShipment(req: { reference: string; items: OrderItem[] }): Promise<{ trackingCode: string }>;
}

export interface AccountingDesk {
  /** Tao viec cho ke toan / van hanh xu ly tay. */
  createManualTask(req: { orderId: string; kind: string; reason: string }): Promise<{ taskId: string }>;
}

export type Integrations = {
  inventory: InventoryService;
  payment: PaymentGateway;
  einvoice: EInvoiceService;
  notification: NotificationService;
  shipping: ShippingPartner;
  accounting: AccountingDesk;
};

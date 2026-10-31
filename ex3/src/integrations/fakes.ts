import { OutOfStockError, type OrderItem } from '../domain/order.js';
import type {
  AccountingDesk,
  EInvoiceService,
  Integrations,
  InventoryService,
  NotificationService,
  PaymentGateway,
  PaymentRecord,
  ShippingPartner,
} from './contracts.js';

/**
 * Cac he thong ben ngoai gia lap (dung cho demo va kiem thu), co the cai loi theo kich ban.
 * Chung nam ngoai "tien trinh xu ly" nen trang thai giu nguyen khi pipeline khoi dong lai.
 */

type Fault = (orderId: string) => 'ok' | 'fail' | 'hang' | 'charge-then-hang' | 'decline';
const hang = () => new Promise<never>(() => {});

export class FakeInventory implements InventoryService {
  readonly stock = new Map<string, number>();
  readonly reservations = new Map<string, OrderItem[]>();
  reserveCalls = 0;

  constructor(stock: Record<string, number>) {
    for (const [sku, qty] of Object.entries(stock)) this.stock.set(sku, qty);
  }

  async reserve(orderId: string, items: OrderItem[]) {
    this.reserveCalls++;
    if (!this.reservations.has(orderId)) {
      if (items.some((i) => (this.stock.get(i.sku) ?? 0) < i.qty)) throw new OutOfStockError('Het hang');
      for (const i of items) this.stock.set(i.sku, this.stock.get(i.sku)! - i.qty);
      this.reservations.set(orderId, items);
    }
    return { reservationId: `rsv-${orderId}` };
  }

  async release(orderId: string) {
    const items = this.reservations.get(orderId);
    if (!items) return;
    for (const i of items) this.stock.set(i.sku, (this.stock.get(i.sku) ?? 0) + i.qty);
    this.reservations.delete(orderId);
  }
}

export class FakePaymentGateway implements PaymentGateway {
  /** So lan tien THUC SU bi tru khoi tai khoan khach. */
  readonly charges: { orderId: string; amount: number }[] = [];
  readonly refunds: string[] = [];
  private readonly byKey = new Map<string, PaymentRecord>();
  captureCalls = 0;
  fault: Fault = () => 'ok';

  /** supportsIdempotency=false: cong khong chong trung theo khoa (truong hop xau nhat). */
  constructor(private readonly supportsIdempotency = true) {}

  async capture(req: { orderId: string; amount: number; idempotencyKey: string }) {
    this.captureCalls++;
    const mode = this.fault(req.orderId);
    if (mode === 'fail') throw new Error('Cong thanh toan 503');
    if (mode === 'hang') return hang();
    if (this.supportsIdempotency && this.byKey.has(req.idempotencyKey)) return this.byKey.get(req.idempotencyKey)!;
    if (mode === 'decline') {
      const rec: PaymentRecord = { status: 'declined', transactionId: `tx-declined-${req.orderId}` };
      this.byKey.set(req.idempotencyKey, rec);
      return rec;
    }
    this.charges.push({ orderId: req.orderId, amount: req.amount });
    const rec: PaymentRecord = { status: 'captured', transactionId: `tx-${this.charges.length}` };
    this.byKey.set(req.idempotencyKey, rec);
    if (mode === 'charge-then-hang') return hang(); // tien da tru nhung phan hoi khong ve
    return rec;
  }

  async getPayment(key: string) {
    return this.byKey.get(key) ?? null;
  }

  async refund(req: { orderId: string; idempotencyKey: string }) {
    if (!this.refunds.includes(req.idempotencyKey)) this.refunds.push(req.idempotencyKey);
    return { refundId: `rf-${req.orderId}` };
  }
}

export class FakeEInvoice implements EInvoiceService {
  readonly issued = new Map<string, string>();
  calls = 0;
  fault: Fault = () => 'ok';

  async issue(req: { orderId: string; amount: number }) {
    this.calls++;
    if (this.fault(req.orderId) === 'fail') throw new Error('He thong hoa don dien tu khong phan hoi');
    if (!this.issued.has(req.orderId)) this.issued.set(req.orderId, `HD-${String(this.issued.size + 1).padStart(6, '0')}`);
    return { number: this.issued.get(req.orderId)! };
  }
}

export class FakeNotification implements NotificationService {
  readonly emails: string[] = [];
  readonly sms: string[] = [];
  smsFault: Fault = () => 'ok';

  async sendEmail(_to: string, orderId: string) {
    this.emails.push(orderId);
  }
  async sendSms(_to: string, orderId: string) {
    if (this.smsFault(orderId) === 'fail') throw new Error('Nha mang tu choi SMS');
    this.sms.push(orderId);
  }
}

export class FakeShipping implements ShippingPartner {
  readonly shipments = new Map<string, string>();
  calls = 0;
  fault: Fault = () => 'ok';

  async createShipment(req: { reference: string; items: OrderItem[] }) {
    this.calls++;
    if (this.fault(req.reference) === 'fail') throw new Error('API doi tac van chuyen 500');
    if (!this.shipments.has(req.reference)) this.shipments.set(req.reference, `GHN-${this.shipments.size + 1}`);
    return { trackingCode: this.shipments.get(req.reference)! };
  }
}

export class FakeAccounting implements AccountingDesk {
  readonly tasks: { orderId: string; kind: string; reason: string }[] = [];
  async createManualTask(req: { orderId: string; kind: string; reason: string }) {
    const existing = this.tasks.findIndex((t) => t.orderId === req.orderId && t.kind === req.kind);
    if (existing === -1) this.tasks.push(req);
    return { taskId: `task-${req.kind}-${req.orderId}` };
  }
}

export function createFakeIntegrations(stock: Record<string, number> = {}, opts: { idempotentGateway?: boolean } = {}) {
  return {
    inventory: new FakeInventory(stock),
    payment: new FakePaymentGateway(opts.idempotentGateway ?? true),
    einvoice: new FakeEInvoice(),
    notification: new FakeNotification(),
    shipping: new FakeShipping(),
    accounting: new FakeAccounting(),
  } satisfies Integrations;
}
export type FakeIntegrations = ReturnType<typeof createFakeIntegrations>;

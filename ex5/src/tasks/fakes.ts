import type { Catalog, ErpClient, Ports, ReportStorage, SalesRepository, SmsGateway } from './ports.js';

/** He thong gia lap cho demo/kiem thu: dieu chinh duoc ti le loi va do tre de tai hien su co. */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class FakeSms implements SmsGateway {
  failRate = 0;
  delayMs = 50;
  readonly sent = new Map<string, string>();
  async send(phone: string, text: string, key: string) {
    await sleep(this.delayMs);
    if (Math.random() < this.failRate) throw new Error('SMS gateway 503');
    if (!this.sent.has(key)) this.sent.set(key, `${phone}: ${text}`);
  }
}

export class FakeStorage implements ReportStorage {
  readonly files = new Map<string, string>();
  async save(reportId: string, content: string) {
    this.files.set(reportId, content);
    return `s3://shopfast-reports/${reportId}.csv`;
  }
}

export class FakeSales implements SalesRepository {
  delayMs = 20;
  async revenueOfDay(_month: string, day: number) {
    await sleep(this.delayMs);
    return 100_000_000 + day * 1_000_000;
  }
}

export class FakeErp implements ErpClient {
  down = false;
  async stockSnapshot() {
    await sleep(30);
    if (this.down) throw new Error('ERP khong phan hoi (ECONNREFUSED)');
    return { AO: 120, QUAN: 80, GIAY: 45 };
  }
}

export class FakeCatalog implements Catalog {
  readonly prices = new Map<string, number>();
  stock: Record<string, number> = {};
  priceWrites = 0;
  delayMs = 5;
  async setPrice(sku: string, price: number) {
    await sleep(this.delayMs);
    this.priceWrites++;
    this.prices.set(sku, price);
  }
  async setStock(stock: Record<string, number>) {
    this.stock = { ...stock };
  }
}

export function createFakePorts() {
  return {
    sms: new FakeSms(),
    storage: new FakeStorage(),
    sales: new FakeSales(),
    erp: new FakeErp(),
    catalog: new FakeCatalog(),
  } satisfies Ports;
}
export type FakePorts = ReturnType<typeof createFakePorts>;

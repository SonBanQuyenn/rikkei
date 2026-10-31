/** Cac he thong ma tac vu nghiep vu goi toi (tach khoi BullMQ de thay the/gia lap duoc). */

export interface SmsGateway {
  /** idempotencyKey: gateway khong gui lai tin cho cung khoa. */
  send(phone: string, text: string, idempotencyKey: string): Promise<void>;
}

export interface ReportStorage {
  /** Ghi de theo reportId -> chay lai khong tao ban trung. */
  save(reportId: string, content: string): Promise<string>;
}

export interface SalesRepository {
  revenueOfDay(month: string, day: number): Promise<number>;
}

export interface ErpClient {
  stockSnapshot(): Promise<Record<string, number>>;
}

export interface Catalog {
  /** Gan gia tuyet doi (khong cong don) -> ap dung lai van ra cung ket qua. */
  setPrice(sku: string, price: number): Promise<void>;
  setStock(stock: Record<string, number>): Promise<void>;
}

export type Ports = {
  sms: SmsGateway;
  storage: ReportStorage;
  sales: SalesRepository;
  erp: ErpClient;
  catalog: Catalog;
};

// Du lieu gia lap cua ShopFast cho dem 29/10 -> sang 30/10/2026 (gio Viet Nam)
export const NOW = new Date("2026-10-30T07:30:00+07:00");
export const NIGHT_START = new Date("2026-10-29T22:00:00+07:00");

export type OrderStatus = "CHO_XAC_NHAN" | "DANG_CHUAN_BI" | "DANG_GIAO" | "DA_GIAO" | "DA_HUY";

export interface Order {
  orderId: string;
  createdAt: Date;
  status: OrderStatus;
  total: number;
  warehouse: string;
  pushedToWarehouse: boolean;
}

export interface Payment {
  paymentId: string;
  orderId: string;
  gateway: "MOMO" | "VNPAY" | "THE_NOI_DIA";
  createdAt: Date;
  success: boolean;
  errorCode?: string;
}

export interface Product {
  sku: string;
  name: string;
  available: number; // am = da ban vuot ton kho
  onSale: boolean;
}

export interface Incident {
  incidentId: string;
  title: string;
  severity: "THAP" | "TRUNG_BINH" | "CAO";
  team: string;
  description: string;
  createdAt: Date;
}

// Don hang dem qua: sinh co dinh 48 don, 6 don tu kho HCM khong duoc day sang kho (ket)
export const orders: Order[] = Array.from({ length: 48 }, (_, i) => {
  const minutes = i * 11; // 22:00 -> ~06:47
  const created = new Date(NIGHT_START.getTime() + minutes * 60_000);
  const stuck = i % 8 === 3;
  return {
    orderId: String(7000 + i),
    createdAt: created,
    status: stuck ? "CHO_XAC_NHAN" : i % 5 === 0 ? "DANG_CHUAN_BI" : "CHO_XAC_NHAN",
    total: 150_000 + ((i * 37_000) % 900_000),
    warehouse: i % 2 === 0 ? "KHO_HN" : "KHO_HCM",
    pushedToWarehouse: !stuck,
  };
});

// Thanh toan dem qua: VNPAY loi BANK_TIMEOUT hang loat tu 02:00 den 04:00
export const payments: Payment[] = orders.map((o, i) => {
  const gateway = (["MOMO", "VNPAY", "THE_NOI_DIA"] as const)[i % 3];
  const hour = o.createdAt.getUTCHours() + 7;
  const inOutage = gateway === "VNPAY" && hour % 24 >= 2 && hour % 24 < 4;
  return {
    paymentId: `PAY-${o.orderId}`,
    orderId: o.orderId,
    gateway,
    createdAt: o.createdAt,
    success: !inOutage && i !== 10,
    errorCode: inOutage ? "BANK_TIMEOUT" : i === 10 ? "INSUFFICIENT_FUNDS" : undefined,
  };
});

// Ty le thanh toan loi trung binh 7 ngay truoc
export const BASELINE = { paymentFailureRate: 0.03, ordersPerNight: 45 };

export const products: Product[] = [
  { sku: "SKU-TAI-NGHE-01", name: "Tai nghe Bluetooth SF Air", available: -4, onSale: true },
  { sku: "SKU-AO-KHOAC-07", name: "Áo khoác gió unisex", available: 0, onSale: true },
  { sku: "SKU-BINH-NUOC-03", name: "Bình nước giữ nhiệt 500ml", available: 6, onSale: true },
  { sku: "SKU-OP-LUNG-12", name: "Ốp lưng iPhone 17", available: 120, onSale: true },
];

export const incidents: Incident[] = [];


export type OrderStatus = "CHO_XAC_NHAN" | "DANG_CHUAN_BI" | "DANG_GIAO" | "DA_GIAO" | "DA_HUY";

export interface Address {
  street: string; // so nha, duong, phuong/xa
  province: string; // tinh/thanh pho (ten chuan)
}

export interface Order {
  orderId: string;
  customerId: string;
  status: OrderStatus;
  address: Address;
  addressChangeCount: number;
}

// Du lieu gia lap
export const orders = new Map<string, Order>(
  [
    { orderId: "1001", customerId: "KH01", status: "CHO_XAC_NHAN", address: { street: "12 Trần Duy Hưng, phường Yên Hòa", province: "Hà Nội" }, addressChangeCount: 0 },
    { orderId: "1002", customerId: "KH01", status: "DANG_CHUAN_BI", address: { street: "45 Lê Lợi, phường Sài Gòn", province: "TP Hồ Chí Minh" }, addressChangeCount: 0 },
    { orderId: "1003", customerId: "KH01", status: "DANG_GIAO", address: { street: "8 Nguyễn Trãi, phường Thanh Xuân", province: "Hà Nội" }, addressChangeCount: 0 },
    { orderId: "1004", customerId: "KH01", status: "DA_GIAO", address: { street: "20 Bạch Đằng, phường Hải Châu", province: "Đà Nẵng" }, addressChangeCount: 0 },
    { orderId: "1005", customerId: "KH01", status: "CHO_XAC_NHAN", address: { street: "3 Hàng Bài, phường Hoàn Kiếm", province: "Hà Nội" }, addressChangeCount: 1 },
    { orderId: "2001", customerId: "KH02", status: "CHO_XAC_NHAN", address: { street: "99 Lạch Tray, phường Gia Viên", province: "Hải Phòng" }, addressChangeCount: 0 },
  ].map((o) => [o.orderId, o as Order]),
);

// 34 tinh/thanh pho (sau sap xep don vi hanh chinh 2025)
export const PROVINCES = [
  "Hà Nội", "Huế", "Lai Châu", "Điện Biên", "Sơn La", "Lạng Sơn", "Quảng Ninh", "Thanh Hóa",
  "Nghệ An", "Hà Tĩnh", "Cao Bằng", "Tuyên Quang", "Lào Cai", "Thái Nguyên", "Phú Thọ", "Bắc Ninh",
  "Hưng Yên", "Hải Phòng", "Ninh Bình", "Quảng Trị", "Đà Nẵng", "Quảng Ngãi", "Gia Lai", "Khánh Hòa",
  "Lâm Đồng", "Đắk Lắk", "TP Hồ Chí Minh", "Đồng Nai", "Tây Ninh", "Cần Thơ", "Vĩnh Long", "Đồng Tháp",
  "Cà Mau", "An Giang",
];

// Cach goi khac thuong gap -> ten chuan
export const PROVINCE_ALIASES: Record<string, string> = {
  "hcm": "TP Hồ Chí Minh",
  "tphcm": "TP Hồ Chí Minh",
  "ho chi minh": "TP Hồ Chí Minh",
  "sai gon": "TP Hồ Chí Minh",
  "hn": "Hà Nội",
  "ha noi": "Hà Nội",
  "da nang": "Đà Nẵng",
  "hai phong": "Hải Phòng",
  "can tho": "Cần Thơ",
  "thua thien hue": "Huế",
};

export const HOTLINE = "1900 1234";

import { PROVINCES, PROVINCE_ALIASES } from "./data.ts";

// Bo dau, viet thuong, gop khoang trang - dung de so khop ten tinh
export function simplify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Tra ve ten tinh chuan, hoac null neu khong nhan ra
export function findProvince(raw: string): string | null {
  const key = simplify(raw).replace(/^(tinh|thanh pho|tp)\s*/, "").trim();
  if (!key) return null;
  if (PROVINCE_ALIASES[key]) return PROVINCE_ALIASES[key];
  return PROVINCES.find((p) => simplify(p).replace(/^tp\s*/, "") === key) ?? null;
}

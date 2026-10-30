import Anthropic from "@anthropic-ai/sdk";
import { TEAMS } from "./config.ts";

// Du lieu gia lap
const ORDERS: Record<string, object> = {
  "5001": { status: "DA_HUY", cancelReason: "THANH_TOAN_THAT_BAI", paidAmount: 0 },
  "5002": { status: "DA_GIAO", deliveredAt: "2026-10-28", refundStatus: "DA_HOAN" },
  "5003": { status: "DA_HUY", cancelReason: "HET_HANG", paidAmount: 450_000, refundStatus: "CHUA_HOAN" },
};
const PAYMENTS: Record<string, object> = {
  "5001": { attempts: 2, lastError: "BANK_TIMEOUT", charged: false },
  "5002": { charged: true, refundedAt: "2026-10-29", refundChannel: "VI_DIEN_TU" },
  "5003": { charged: true, refunded: false },
};
const STOCK: Record<string, object> = {
  "SKU-AO-01": { available: 0, restockDate: "2026-11-10" },
  "SKU-GIAY-02": { available: 35 },
};

export const lookupTools: Anthropic.Tool[] = [
  {
    name: "get_order",
    description: "Tra trạng thái đơn hàng, lý do hủy, trạng thái hoàn tiền theo mã đơn.",
    input_schema: { type: "object", properties: { orderId: { type: "string" } }, required: ["orderId"] },
  },
  {
    name: "get_payment",
    description: "Tra lịch sử thanh toán / hoàn tiền của một đơn.",
    input_schema: { type: "object", properties: { orderId: { type: "string" } }, required: ["orderId"] },
  },
  {
    name: "check_stock",
    description: "Tra tồn kho của một mã sản phẩm (SKU).",
    input_schema: { type: "object", properties: { sku: { type: "string" } }, required: ["sku"] },
  },
  {
    name: "route_ticket",
    description: "Chốt đội xử lý cho vấn đề sau khi đã tra đủ dữ liệu. Gọi đúng 1 lần, ở bước cuối.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        team: { type: "string", enum: [...TEAMS] },
        reason: { type: "string", description: "Căn cứ dữ liệu ngắn gọn" },
      },
      required: ["team", "reason"],
      additionalProperties: false,
    },
  },
];

export function runLookup(name: string, input: Record<string, string>): string {
  const table = name === "get_order" ? ORDERS : name === "get_payment" ? PAYMENTS : name === "check_stock" ? STOCK : null;
  if (!table) throw new Error(`Tool không tồn tại: ${name}`);
  const key = input.orderId ?? input.sku;
  const row = table[key];
  if (!row) throw new Error(`Không tìm thấy dữ liệu cho ${key}`);
  return JSON.stringify(row);
}

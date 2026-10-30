// Phan dinh nghia tool: chi lam viec voi lop service, khong chua logic dieu phoi
import Anthropic from "@anthropic-ai/sdk";
import { getOvernightSummary } from "../services/reportService.ts";
import { listStuckOrders, retryStuckOrders } from "../services/orderService.ts";
import { getPaymentFailures } from "../services/paymentService.ts";
import { getStockAlerts, pauseProductSales } from "../services/inventoryService.ts";
import { createIncident } from "../services/incidentService.ts";
import { NIGHT_START, NOW, type Incident } from "../data/mockDb.ts";

export interface ToolSpec {
  definition: Anthropic.Tool;
  // true = ghi du lieu, bat buoc nguoi xac nhan truoc khi chay
  writes: boolean;
  run: (input: any) => unknown;
  // Mo ta thao tac ghi bang ngon ngu tu nhien de nguoi van hanh xac nhan
  describe?: (input: any) => string;
}

const parseDate = (value: string | undefined, fallback: Date) => {
  if (!value) return fallback;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`Thời điểm không hợp lệ: ${value}`);
  return d;
};

const timeWindow = {
  from: { type: "string", description: "Thời điểm bắt đầu ISO 8601, bỏ trống = 22:00 tối qua" },
  to: { type: "string", description: "Thời điểm kết thúc ISO 8601, bỏ trống = hiện tại" },
} as const;

export const toolSpecs: ToolSpec[] = [
  {
    writes: false,
    definition: {
      name: "get_overnight_summary",
      description:
        "[TỔNG HỢP] Tổng hợp số liệu vận hành trong khoảng thời gian (mặc định đêm qua 22:00 → hiện tại): số đơn, doanh thu, " +
        "tỷ lệ thanh toán lỗi so với trung bình 7 ngày, số đơn kẹt, cảnh báo tồn kho, và danh sách bất thường. Gọi đầu tiên khi được hỏi chung chung.",
      input_schema: { type: "object", properties: { ...timeWindow }, additionalProperties: false },
    },
    run: (i: { from?: string; to?: string }) => getOvernightSummary(parseDate(i.from, NIGHT_START), parseDate(i.to, NOW)),
  },
  {
    writes: false,
    definition: {
      name: "list_stuck_orders",
      description: "[ĐỌC] Liệt kê đơn chờ xác nhận quá minHours giờ mà chưa được đẩy sang kho.",
      input_schema: {
        type: "object",
        properties: { minHours: { type: "number", description: "Số giờ chờ tối thiểu, mặc định 2" } },
        additionalProperties: false,
      },
    },
    run: (i: { minHours?: number }) => listStuckOrders(i.minHours ?? 2),
  },
  {
    writes: false,
    definition: {
      name: "get_payment_failures",
      description: "[ĐỌC] Chi tiết thanh toán lỗi theo cổng thanh toán và mã lỗi, kèm thời điểm lỗi đầu/cuối.",
      input_schema: { type: "object", properties: { ...timeWindow }, additionalProperties: false },
    },
    run: (i: { from?: string; to?: string }) => getPaymentFailures(parseDate(i.from, NIGHT_START), parseDate(i.to, NOW)),
  },
  {
    writes: false,
    definition: {
      name: "get_stock_alerts",
      description: "[ĐỌC] Sản phẩm đang mở bán nhưng bán vượt tồn kho, hết hàng hoặc sắp hết.",
      input_schema: { type: "object", properties: {}, additionalProperties: false },
    },
    run: () => getStockAlerts(),
  },
  {
    writes: true,
    definition: {
      name: "retry_stuck_orders",
      description: "[GHI] Đẩy lại các đơn bị kẹt sang kho. Cần người vận hành xác nhận.",
      strict: true,
      input_schema: {
        type: "object",
        properties: { orderIds: { type: "array", items: { type: "string" } } },
        required: ["orderIds"],
        additionalProperties: false,
      },
    },
    run: (i: { orderIds: string[] }) => retryStuckOrders(i.orderIds),
    describe: (i: { orderIds: string[] }) => `Đẩy lại ${i.orderIds.length} đơn sang kho: ${i.orderIds.join(", ")}`,
  },
  {
    writes: true,
    definition: {
      name: "pause_product_sales",
      description: "[GHI] Tạm ngừng bán một sản phẩm (ví dụ đang bán vượt tồn kho). Cần người vận hành xác nhận.",
      strict: true,
      input_schema: {
        type: "object",
        properties: { sku: { type: "string" }, reason: { type: "string" } },
        required: ["sku", "reason"],
        additionalProperties: false,
      },
    },
    run: (i: { sku: string; reason: string }) => pauseProductSales(i.sku, i.reason),
    describe: (i: { sku: string; reason: string }) => `Tạm ngừng bán sản phẩm ${i.sku} - lý do: ${i.reason}`,
  },
  {
    writes: true,
    definition: {
      name: "create_incident",
      description:
        "[GHI] Tạo sự cố giao cho đội phụ trách khi vấn đề không tự xử lý được (ví dụ cổng thanh toán lỗi). Cần người vận hành xác nhận.",
      strict: true,
      input_schema: {
        type: "object",
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: ["THAP", "TRUNG_BINH", "CAO"] },
          team: { type: "string", enum: ["THANH_TOAN", "KHO_VAN", "KY_THUAT", "CSKH"] },
          description: { type: "string" },
        },
        required: ["title", "severity", "team", "description"],
        additionalProperties: false,
      },
    },
    run: (i: Omit<Incident, "incidentId" | "createdAt">) => createIncident(i),
    describe: (i: { title: string; severity: string; team: string }) =>
      `Tạo sự cố "${i.title}" (mức ${i.severity}) giao đội ${i.team}`,
  },
];

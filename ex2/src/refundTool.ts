import Anthropic from "@anthropic-ai/sdk";

export const REFUND_REASONS = ["HANG_LOI", "GIAO_CHAM", "TRU_TIEN_2_LAN"] as const;
export type RefundReason = (typeof REFUND_REASONS)[number];

export const MIN_REFUND_AMOUNT = 1_000;
export const MAX_REFUND_AMOUNT = 5_000_000;

export interface RefundInput {
  orderId: string;
  amount: number;
  reason: RefundReason;
}

// Luoc do tool da dien du 5 cho khuyet
export const createRefundTool = {
  name: "create_refund",
  // (1) mo ta du ngu canh nghiep vu: khi nao duoc goi, khi nao KHONG duoc goi, don vi tien
  description:
    "Tạo phiếu hoàn tiền cho một đơn hàng ShopFast. " +
    "Chỉ được hoàn theo đúng 3 lý do đã được duyệt: HANG_LOI (hàng bị lỗi/hỏng), " +
    "GIAO_CHAM (giao hàng trễ so với cam kết), TRU_TIEN_2_LAN (khách bị trừ tiền 2 lần cho cùng một đơn). " +
    "Mọi lý do khác (ví dụ: khách không thích màu, đổi ý) KHÔNG được hoàn: không gọi tool này mà giải thích cho người dùng là lý do không hợp lệ. " +
    "Số tiền hoàn tối thiểu 1.000đ, tối đa 5.000.000đ mỗi phiếu. Vượt mức thì không gọi tool mà báo cần cấp quản lý duyệt. " +
    "amount luôn là số nguyên tính bằng ĐỒNG: phải quy đổi đơn vị rút gọn trước khi gọi " +
    "(\"5tr\" / \"5 triệu\" = 5000000, \"500k\" / \"500 nghìn\" = 500000, \"1,2tr\" = 1200000). " +
    "Nếu không chắc đơn vị, hoặc thiếu mã đơn hay lý do, thì hỏi lại người dùng, không được tự đoán.",
  input_schema: {
    type: "object",
    properties: {
      orderId: {
        type: "string",
        description: "Mã đơn hàng ShopFast, chỉ gồm chữ số, ví dụ \"1024\".",
      },
      // (2) gioi han gia tri: so nguyen, tu 1.000d den 5.000.000d
      amount: {
        type: "integer",
        minimum: MIN_REFUND_AMOUNT,
        maximum: MAX_REFUND_AMOUNT,
        description: "Số tiền hoàn, số nguyên, đơn vị ĐỒNG (VND). Ví dụ 5tr phải truyền 5000000.",
      },
      // (3) rang buoc gia tri: chi 3 ly do duoc duyet
      reason: {
        type: "string",
        enum: [...REFUND_REASONS],
        description: "Một trong 3 lý do được duyệt.",
      },
    },
    // (4) khai bao truong bat buoc
    required: ["orderId", "amount", "reason"],
    // (5) chan truong la
    additionalProperties: false,
  },
} satisfies Anthropic.Tool;

// Strict mode (structured outputs) chua ho tro minimum/maximum nen bo 2 rang buoc nay
// khoi ban gui len API; chung van duoc kiem tra phia server o validateRefundInput.
export const createRefundApiTool: Anthropic.Tool = {
  ...createRefundTool,
  strict: true,
  input_schema: {
    ...createRefundTool.input_schema,
    properties: {
      ...createRefundTool.input_schema.properties,
      amount: {
        type: "integer",
        description: createRefundTool.input_schema.properties.amount.description,
      },
    },
  },
};

// Kiem tra lai toan bo luoc do o phia server - khong tin tuyet doi vao model
export function validateRefundInput(input: unknown): { ok: true; value: RefundInput } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { ok: false, error: "Tham số phải là một object." };
  }
  const data = input as Record<string, unknown>;
  const allowed = Object.keys(createRefundTool.input_schema.properties);

  const extra = Object.keys(data).filter((k) => !allowed.includes(k));
  if (extra.length > 0) return { ok: false, error: `Trường không được phép: ${extra.join(", ")}.` };

  const missing = createRefundTool.input_schema.required.filter((k) => data[k] === undefined);
  if (missing.length > 0) return { ok: false, error: `Thiếu trường bắt buộc: ${missing.join(", ")}.` };

  const { orderId, amount, reason } = data;
  if (typeof orderId !== "string" || !/^\d+$/.test(orderId)) {
    return { ok: false, error: "orderId phải là chuỗi chữ số, ví dụ \"1024\"." };
  }
  if (typeof amount !== "number" || !Number.isInteger(amount)) {
    return { ok: false, error: "amount phải là số nguyên đơn vị đồng." };
  }
  if (amount < MIN_REFUND_AMOUNT) {
    return {
      ok: false,
      error:
        `Số tiền ${amount}đ nhỏ hơn mức tối thiểu ${MIN_REFUND_AMOUNT.toLocaleString("vi-VN")}đ. ` +
        "Có thể đơn vị bị hiểu sai (ví dụ \"5tr\" phải là 5.000.000đ), hãy xác nhận lại với người dùng.",
    };
  }
  if (amount > MAX_REFUND_AMOUNT) {
    return {
      ok: false,
      error: `Số tiền ${amount.toLocaleString("vi-VN")}đ vượt hạn mức ${MAX_REFUND_AMOUNT.toLocaleString("vi-VN")}đ mỗi phiếu.`,
    };
  }
  if (typeof reason !== "string" || !(REFUND_REASONS as readonly string[]).includes(reason)) {
    return { ok: false, error: `Lý do không hợp lệ. Chỉ chấp nhận: ${REFUND_REASONS.join(", ")}.` };
  }
  return { ok: true, value: { orderId, amount, reason: reason as RefundReason } };
}

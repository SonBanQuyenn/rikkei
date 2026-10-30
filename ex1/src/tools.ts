import Anthropic from "@anthropic-ai/sdk";

// Du lieu gia lap cua he thong don hang ShopFast
const ORDERS: Record<string, { status: string; location: string; eta: string }> = {
  "1024": { status: "DANG_GIAO", location: "Bưu cục Cầu Giấy, Hà Nội", eta: "2026-10-31" },
  "1025": { status: "CHO_XAC_NHAN", location: "Kho ShopFast Long Biên", eta: "2026-11-03" },
};

export const tools: Anthropic.Tool[] = [
  {
    name: "get_order_status",
    description:
      "Tra cứu trạng thái và vị trí hiện tại của một đơn hàng ShopFast theo mã đơn. " +
      "Dùng khi khách hỏi đơn hàng đang ở đâu, khi nào giao.",
    input_schema: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "Mã đơn hàng, ví dụ \"1024\"" },
      },
      required: ["orderId"],
    },
  },
];

export async function executeTool(name: string, input: unknown): Promise<string> {
  if (name === "get_order_status") {
    const { orderId } = input as { orderId: string };
    const order = ORDERS[orderId];
    if (!order) throw new Error(`Không tìm thấy đơn hàng ${orderId}`);
    return JSON.stringify({ orderId, ...order });
  }
  throw new Error(`Tool không tồn tại: ${name}`);
}

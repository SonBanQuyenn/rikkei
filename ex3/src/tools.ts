import Anthropic from "@anthropic-ai/sdk";
import { BusinessError, getOrder, updateShippingAddress } from "./services.ts";

// customerId KHONG phai tham so cua tool: lay tu phien dang nhap, model khong the gia mao
export const tools: Anthropic.Tool[] = [
  {
    name: "get_order",
    description:
      "[CHỈ ĐỌC] Tra cứu một đơn hàng của khách đang chat: trạng thái, địa chỉ giao hiện tại, số lần đã đổi địa chỉ, " +
      "và đơn có được đổi địa chỉ hay không (canChangeAddress, blockedReason). " +
      "Luôn gọi tool này trước khi bàn chuyện đổi địa chỉ.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        orderId: { type: "string", description: "Mã đơn hàng khách cung cấp, ví dụ \"1001\"." },
      },
      required: ["orderId"],
      additionalProperties: false,
    },
  },
  {
    name: "update_shipping_address",
    description:
      "[GHI DỮ LIỆU] Đổi địa chỉ giao hàng của một đơn. Chỉ gọi khi: đã gọi get_order và canChangeAddress = true, " +
      "đã đọc lại địa chỉ mới đầy đủ cho khách và khách đã xác nhận đồng ý. " +
      "Tách địa chỉ khách nhập thành street (số nhà, đường, phường/xã) và province (tỉnh/thành phố). " +
      "Nếu khách không nêu tỉnh/thành thì hỏi lại, không được tự suy đoán.",
    strict: true,
    input_schema: {
      type: "object",
      properties: {
        orderId: { type: "string" },
        street: { type: "string", description: "Số nhà, tên đường, phường/xã." },
        province: { type: "string", description: "Tỉnh/thành phố, ví dụ \"Hà Nội\", \"TP Hồ Chí Minh\"." },
      },
      required: ["orderId", "street", "province"],
      additionalProperties: false,
    },
  },
];

export function executeTool(customerId: string, name: string, input: Record<string, string>): string {
  try {
    switch (name) {
      case "get_order":
        return JSON.stringify(getOrder(customerId, input.orderId));
      case "update_shipping_address":
        return JSON.stringify(updateShippingAddress(customerId, input.orderId, input.street, input.province));
      default:
        throw new BusinessError(`Tool không tồn tại: ${name}`);
    }
  } catch (err) {
    // Loi nghiep vu tra ve cho model dang text; loi he thong thi nem tiep
    if (err instanceof BusinessError) throw err;
    throw new Error("Hệ thống đang gặp sự cố, vui lòng thử lại sau.", { cause: err });
  }
}

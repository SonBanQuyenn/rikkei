// Chay thu bo dinh tuyen voi cac ticket mau (can ANTHROPIC_API_KEY)
import Anthropic from "@anthropic-ai/sdk";
import { routeTicket } from "./router.ts";

const oldChat = Array.from(
  { length: 120 },
  (_, i) => `[${i + 1}] Khách: Cho mình hỏi về khuyến mãi tháng trước. CSKH: Dạ chương trình đã kết thúc ạ.`,
).join("\n");

const SAMPLE_TICKETS = [
  { id: "T-001", text: "Mã giảm giá FREESHIP không áp dụng được khi thanh toán, báo lỗi mã hết hạn." },
  { id: "T-002", text: "Đơn 5003 của mình bị hủy mà tiền chưa thấy hoàn, giải quyết giúp mình." },
  { id: "T-003", text: "Áo SKU-AO-01 bao giờ có hàng lại vậy shop? À mà đơn 5001 hôm qua mình bị trừ tiền 2 lần nhé." },
  { id: "T-004", text: `${oldChat}\nKhách: Giờ mình cần đổi địa chỉ giao cho đơn 5002 sang nhà mới ở cùng quận.` },
];

const client = new Anthropic();
for (const ticket of SAMPLE_TICKETS) {
  const result = await routeTicket(client, ticket.id, ticket.text);
  console.log(JSON.stringify(result, null, 2));
}

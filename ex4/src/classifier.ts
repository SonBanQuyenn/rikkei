// Buoc 1: mot loi goi model re, khong tool, de tach van de va gan nhan
import Anthropic from "@anthropic-ai/sdk";
import { MAX_ISSUES, MODEL, TEAMS, TEAM_DESCRIPTIONS, type Team } from "./config.ts";

export interface Issue {
  summary: string;
  team: Team;
  needsLookup: boolean;
  orderId: string;
  sku: string;
}

const SYSTEM_PROMPT = `Bạn là bộ phân loại ticket CSKH của ShopFast.
Đọc ticket, tách thành các vấn đề ĐỘC LẬP (tối đa ${MAX_ISSUES}). Ticket hỏi 2 việc khác nhau thì trả 2 vấn đề.
Với mỗi vấn đề, chọn 1 đội xử lý:
${TEAMS.map((t) => `- ${t}: ${TEAM_DESCRIPTIONS[t]}`).join("\n")}
needsLookup = true khi KHÔNG thể chọn đúng đội nếu chưa tra dữ liệu đơn hàng/thanh toán/tồn kho
(ví dụ "chưa nhận được tiền hoàn" cần xem đơn đã hoàn hay chưa, "đơn bị hủy không rõ lý do" cần xem do thanh toán hay do kho).
orderId / sku: mã đơn / mã sản phẩm nếu khách có nêu, nếu không thì để chuỗi rỗng.
Bỏ qua lịch sử chat cũ đã được giải quyết, tập trung vào vấn đề khách đang cần.`;

const ISSUES_SCHEMA = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          summary: { type: "string" },
          team: { type: "string", enum: [...TEAMS] },
          needsLookup: { type: "boolean" },
          orderId: { type: "string" },
          sku: { type: "string" },
        },
        required: ["summary", "team", "needsLookup", "orderId", "sku"],
        additionalProperties: false,
      },
    },
  },
  required: ["issues"],
  additionalProperties: false,
};

export async function classifyTicket(client: Anthropic, ticketText: string, signal: AbortSignal): Promise<Issue[]> {
  const response = await client.messages.create(
    {
      model: MODEL,
      max_tokens: 1024,
      // Phan loai don gian: tat thinking va effort thap de giu do tre
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: { type: "json_schema", schema: ISSUES_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: `<ticket>\n${ticketText}\n</ticket>` }],
    },
    { signal, maxRetries: 0 },
  );
  if (response.stop_reason !== "end_turn") {
    throw new Error(`Phân loại không hoàn tất: stop_reason=${response.stop_reason}`);
  }
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  const { issues } = JSON.parse(textBlock?.text ?? "{}") as { issues?: Issue[] };
  if (!issues || issues.length === 0) throw new Error("Bộ phân loại không trả về vấn đề nào");
  return issues.slice(0, MAX_ISSUES);
}

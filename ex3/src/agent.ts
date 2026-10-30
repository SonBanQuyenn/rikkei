import Anthropic from "@anthropic-ai/sdk";
import { executeTool, tools } from "./tools.ts";

const MAX_TURNS = 8;

const SYSTEM_PROMPT = `Bạn là trợ lý CSKH của ShopFast, chuyên hỗ trợ khách đổi địa chỉ giao hàng.
Quy trình:
1. Hỏi mã đơn nếu khách chưa nêu, rồi gọi get_order.
2. Nếu canChangeAddress = false: thông báo blockedReason cho khách và dừng.
3. Hỏi địa chỉ mới nếu chưa có. Địa chỉ phải có số nhà/đường, phường/xã và tỉnh/thành.
4. Đọc lại địa chỉ mới cho khách và hỏi xác nhận. Chỉ gọi update_shipping_address sau khi khách đồng ý rõ ràng.
5. Nếu tool trả lỗi, giải thích lại cho khách bằng lời lẽ thân thiện, không nhắc tới tên tool hay mã lỗi.
Trả lời ngắn gọn, lịch sự, bằng tiếng Việt.`;

// Mot phien chat gan voi khach da dang nhap
export class AddressChangeSession {
  private messages: Anthropic.MessageParam[] = [];

  constructor(
    private readonly client: Anthropic,
    private readonly customerId: string,
  ) {}

  async send(userText: string): Promise<string> {
    this.messages.push({ role: "user", content: userText });

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await this.client.messages.create({
        model: "claude-opus-5",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        tools,
        messages: this.messages,
      });
      this.messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "end_turn") {
        return response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("");
      }
      if (response.stop_reason === "pause_turn") continue;
      if (response.stop_reason !== "tool_use") {
        throw new Error(`Lượt hội thoại dừng bất thường: stop_reason=${response.stop_reason}`);
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        try {
          const output = executeTool(this.customerId, block.name, block.input as Record<string, string>);
          results.push({ type: "tool_result", tool_use_id: block.id, content: output });
        } catch (err) {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: err instanceof Error ? err.message : String(err),
            is_error: true,
          });
        }
      }
      this.messages.push({ role: "user", content: results });
    }
    throw new Error(`Agent vượt quá ${MAX_TURNS} vòng lặp`);
  }
}

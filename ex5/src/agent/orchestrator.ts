// Phan dieu phoi agent: vong lap, gioi han 8 vong, cong xac nhan cho thao tac ghi
import Anthropic from "@anthropic-ai/sdk";
import { toolSpecs, type ToolSpec } from "../tools/definitions.ts";
import { BusinessError } from "../services/errors.ts";

export const MODEL = "claude-opus-5";
export const MAX_ITERATIONS = 8;

const SYSTEM_PROMPT = `Bạn là trợ lý vận hành của ShopFast, làm việc với giám đốc vận hành mỗi sáng.
Mục tiêu: trả lời nhanh "đêm qua có gì bất thường không", giải thích nguyên nhân bằng số liệu, và đề xuất/thực hiện xử lý.
- Câu hỏi chung chung: gọi get_overnight_summary trước, chỉ đào sâu vào mục bất thường.
- Gọi song song các tool chỉ đọc khi có thể.
- Tool [GHI] sẽ được hỏi xác nhận người vận hành; nếu bị từ chối thì tôn trọng, không thử lại.
- Không tự bịa số liệu; chỉ dùng số liệu từ tool.
- Trả lời tiếng Việt, ngắn gọn: mục bất thường → nguyên nhân → đã/đề xuất xử lý gì.`;

// Ham hoi xac nhan duoc tiem tu ngoai (CLI hoi nguoi, test tu dong tra loi)
export type ConfirmFn = (action: string) => Promise<boolean>;

export class OpsAssistant {
  private readonly messages: Anthropic.MessageParam[] = [];
  private readonly specs = new Map<string, ToolSpec>(toolSpecs.map((s) => [s.definition.name, s]));

  constructor(
    private readonly client: Anthropic,
    private readonly confirm: ConfirmFn,
  ) {}

  async ask(question: string): Promise<string> {
    // Giu lich su sach neu luot nay loi giua chung
    const checkpoint = this.messages.length;
    this.messages.push({ role: "user", content: question });
    try {
      return await this.loop();
    } catch (err) {
      this.messages.length = checkpoint;
      return friendlyError(err);
    }
  }

  private async loop(): Promise<string> {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const response = await this.client.messages.create({
        model: MODEL,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        tools: toolSpecs.map((s) => s.definition),
        messages: this.messages,
      });
      this.messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason === "end_turn") return textOf(response);
      if (response.stop_reason === "pause_turn") continue;
      if (response.stop_reason !== "tool_use") {
        throw new Error(`Lượt hội thoại dừng bất thường: stop_reason=${response.stop_reason}`);
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type === "tool_use") results.push(await this.execute(block));
      }
      this.messages.push({ role: "user", content: results });
    }

    // Het 8 vong: dong lai lich su hop le va bao cho nguoi dung
    this.messages.push({ role: "assistant", content: "(Dừng do vượt giới hạn vòng lặp.)" });
    return `Yêu cầu này cần nhiều hơn ${MAX_ITERATIONS} bước xử lý nên tôi đã dừng lại để tránh chạy quá lâu. Anh/chị thử hỏi cụ thể hơn (ví dụ: "chi tiết thanh toán lỗi đêm qua") nhé.`;
  }

  private async execute(block: Anthropic.ToolUseBlock): Promise<Anthropic.ToolResultBlockParam> {
    const spec = this.specs.get(block.name);
    const result = (content: string, is_error = false): Anthropic.ToolResultBlockParam => ({
      type: "tool_result",
      tool_use_id: block.id,
      content,
      ...(is_error ? { is_error } : {}),
    });

    if (!spec) return result(`Tool không tồn tại: ${block.name}`, true);

    try {
      if (spec.writes) {
        const action = spec.describe?.(block.input) ?? `${block.name} ${JSON.stringify(block.input)}`;
        if (!(await this.confirm(action))) {
          return result("Người vận hành đã TỪ CHỐI thao tác này. Không thực hiện, không thử lại.");
        }
      }
      return result(JSON.stringify(spec.run(block.input)));
    } catch (err) {
      const message = err instanceof BusinessError || err instanceof Error ? err.message : String(err);
      return result(message, true);
    }
  }
}

function textOf(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function friendlyError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return "Chưa cấu hình đúng ANTHROPIC_API_KEY, anh/chị kiểm tra lại giúp nhé.";
  if (err instanceof Anthropic.RateLimitError) return "Hệ thống AI đang quá tải, anh/chị thử lại sau ít phút nhé.";
  if (err instanceof Anthropic.APIConnectionError) return "Mất kết nối tới dịch vụ AI, anh/chị kiểm tra mạng rồi thử lại nhé.";
  if (err instanceof Anthropic.APIError) return `Dịch vụ AI báo lỗi (${err.status ?? "không rõ"}), anh/chị thử lại sau nhé.`;
  return "Đã có lỗi không mong muốn, anh/chị thử lại hoặc hỏi theo cách khác nhé.";
}

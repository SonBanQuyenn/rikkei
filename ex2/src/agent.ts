import Anthropic from "@anthropic-ai/sdk";
import { createRefundApiTool } from "./refundTool.ts";
import { createRefund } from "./refundService.ts";

const MAX_TURNS = 6;

const SYSTEM_PROMPT =
  "Bạn là trợ lý kế toán của ShopFast, hỗ trợ lập phiếu hoàn tiền bằng tool create_refund. " +
  "Tuân thủ tuyệt đối quy tắc trong mô tả tool. Trả lời bằng tiếng Việt, ngắn gọn.";

export type Logger = (event: string, data: unknown) => void;

export async function runRefundAgent(userInput: string, client: Anthropic, log: Logger): Promise<string> {
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userInput }];
  log("user", userInput);

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: [createRefundApiTool],
      messages,
    });
    messages.push({ role: "assistant", content: response.content });
    log("model_response", { stop_reason: response.stop_reason, content: response.content });

    if (response.stop_reason === "end_turn") {
      const answer = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      log("final_answer", answer);
      return answer;
    }
    if (response.stop_reason === "pause_turn") continue;
    if (response.stop_reason !== "tool_use") {
      throw new Error(`Lượt hội thoại dừng bất thường: stop_reason=${response.stop_reason}`);
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      log("tool_call", { name: block.name, input: block.input });
      try {
        if (block.name !== "create_refund") throw new Error(`Tool không tồn tại: ${block.name}`);
        const ticket = createRefund(block.input);
        log("tool_result", ticket);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(ticket) });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log("tool_rejected", message);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: message, is_error: true });
      }
    }
    messages.push({ role: "user", content: toolResults });
  }
  throw new Error(`Agent vượt quá ${MAX_TURNS} vòng lặp`);
}

// agent.ts - ban da sua: lap cho toi khi stop_reason === "end_turn"
import Anthropic from "@anthropic-ai/sdk";
import { tools, executeTool } from "./tools.ts";

// Chan vong lap vo han neu model goi tool mai khong dung
const MAX_TURNS = 10;

export async function runAgent(userInput: string, client: Anthropic): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userInput },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 4096,
      tools,
      messages,
    });

    // Sua loi 2: luot assistant (chua tool_use) phai vao lich su TRUOC tool_result
    messages.push({ role: "assistant", content: response.content });

    // Sua loi 4: chi end_turn moi la cau tra loi hoan chinh
    if (response.stop_reason === "end_turn") {
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
    }

    // Server tam dung luot dai: gui lai lich su de model lam tiep
    if (response.stop_reason === "pause_turn") continue;

    if (response.stop_reason !== "tool_use") {
      throw new Error(`Lượt hội thoại dừng bất thường: stop_reason=${response.stop_reason}`);
    }

    // Sua loi 3: gom TAT CA tool_result vao MOT message user
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;
      try {
        const result = await executeTool(block.name, block.input);
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
      } catch (err) {
        // Tool loi thi bao lai cho model xu ly, khong lam sap ca agent
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: err instanceof Error ? err.message : String(err),
          is_error: true,
        });
      }
    }
    // Sua loi 1: gui ket qua tool nguoc lai cho model va lap tiep
    messages.push({ role: "user", content: toolResults });
  }

  throw new Error(`Agent vượt quá ${MAX_TURNS} vòng lặp mà chưa trả lời xong`);
}

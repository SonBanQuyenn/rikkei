// Buoc 2: chi cac van de can tra cuu moi vao agent co tool
import Anthropic from "@anthropic-ai/sdk";
import { MODEL, TEAMS, TEAM_DESCRIPTIONS, type Team } from "./config.ts";
import type { Issue } from "./classifier.ts";
import { lookupTools, runLookup } from "./lookupTools.ts";

const MAX_TURNS = 4;

const SYSTEM_PROMPT = `Bạn định tuyến một vấn đề CSKH của ShopFast tới đúng đội xử lý.
Các đội:
${TEAMS.map((t) => `- ${t}: ${TEAM_DESCRIPTIONS[t]}`).join("\n")}
Tra dữ liệu cần thiết bằng get_order / get_payment / check_stock (gọi song song nếu được), sau đó gọi route_ticket.
Không trò chuyện, không giải thích ngoài tool.`;

export async function resolveIssue(client: Anthropic, issue: Issue, signal: AbortSignal): Promise<{ team: Team; reason: string }> {
  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content:
        `Vấn đề: ${issue.summary}\nMã đơn: ${issue.orderId || "(không có)"}\nSKU: ${issue.sku || "(không có)"}\n` +
        `Phân loại sơ bộ: ${issue.team}`,
    },
  ];

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 2048,
        output_config: { effort: "low" },
        system: SYSTEM_PROMPT,
        tools: lookupTools,
        messages,
      },
      { signal, maxRetries: 0 },
    );
    messages.push({ role: "assistant", content: response.content });

    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const route = toolUses.find((b) => b.name === "route_ticket");
    if (route) return route.input as { team: Team; reason: string };

    if (response.stop_reason !== "tool_use") break;

    const results: Anthropic.ToolResultBlockParam[] = toolUses.map((block) => {
      try {
        return { type: "tool_result", tool_use_id: block.id, content: runLookup(block.name, block.input as Record<string, string>) };
      } catch (err) {
        return { type: "tool_result", tool_use_id: block.id, content: (err as Error).message, is_error: true };
      }
    });
    messages.push({ role: "user", content: results });
  }
  throw new Error("Agent không chốt được đội xử lý");
}

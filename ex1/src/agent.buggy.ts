// agent.buggy.ts - ban goc dang chay tren staging (giu nguyen logic de tai hien loi).
// Chi khac ban goc o cho nhan client qua tham so de test co the gia lap model.
import Anthropic from "@anthropic-ai/sdk";
import { tools, executeTool } from "./tools.ts";

export async function runAgent(userInput: string, client: Anthropic) {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userInput },
  ];

  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    tools,
    messages,
  });

  const toolUses = response.content.filter((b) => b.type === "tool_use");

  for (const tool of toolUses) {
    const result = await executeTool(tool.name, tool.input);
    messages.push({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: tool.id, content: result },
      ],
    });
  }

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock ? textBlock.text : "";
}

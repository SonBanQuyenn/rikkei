// Giao dien dong lenh cho giam doc van hanh
import Anthropic from "@anthropic-ai/sdk";
import { createInterface } from "node:readline/promises";
import { OpsAssistant } from "./agent/orchestrator.ts";

const rl = createInterface({ input: process.stdin, output: process.stdout });

const confirm = async (action: string) => {
  const answer = await rl.question(`\n⚠  Xác nhận thao tác ghi dữ liệu:\n   ${action}\n   Đồng ý? (c/k): `);
  return ["c", "co", "có", "y", "yes"].includes(answer.trim().toLowerCase());
};

const assistant = new OpsAssistant(new Anthropic(), confirm);

console.log('Trợ lý vận hành ShopFast. Gõ "thoat" để kết thúc.');
while (true) {
  const question = (await rl.question("\nBạn: ")).trim();
  if (!question) continue;
  if (question.toLowerCase() === "thoat") break;
  console.log(`\nTrợ lý: ${await assistant.ask(question)}`);
}
rl.close();

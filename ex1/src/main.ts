import Anthropic from "@anthropic-ai/sdk";
import { runAgent } from "./agent.ts";

const question = process.argv[2] ?? "Đơn 1024 của tôi đang ở đâu?";
const client = new Anthropic();

console.log(`Khách: ${question}`);
console.log(`Agent: ${await runAgent(question, client)}`);

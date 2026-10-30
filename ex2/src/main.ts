// Chay thu agent voi cac yeu cau mau va ghi log vao thu muc logs/
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { runRefundAgent } from "./agent.ts";

const RUNS = [
  { file: "run-1-hop-le.log", input: "Đơn 1024 khách nhận hàng bị vỡ màn hình, hoàn cho khách 1.500.000đ." },
  { file: "run-2-khong-thich-mau.log", input: "Đơn 1025 hoàn 50 triệu vì khách không thích màu." },
  { file: "run-3-don-vi-rut-gon.log", input: "Đơn 1026 bị trừ tiền 2 lần, cho tôi hoàn 5tr." },
];

const client = new Anthropic();
mkdirSync("logs", { recursive: true });

for (const run of RUNS) {
  const lines: string[] = [];
  const log = (event: string, data: unknown) => {
    const line = `[${new Date().toISOString()}] ${event}: ${typeof data === "string" ? data : JSON.stringify(data)}`;
    lines.push(line);
    console.log(line);
  };
  try {
    await runRefundAgent(run.input, client, log);
  } catch (err) {
    log("error", err instanceof Error ? err.message : String(err));
  }
  writeFileSync(`logs/${run.file}`, lines.join("\n") + "\n", "utf8");
  console.log(`=> Đã ghi logs/${run.file}\n`);
}

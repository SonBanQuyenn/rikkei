// Chat CLI: npm start -- KH01   (KH01 = khach dang dang nhap)
import Anthropic from "@anthropic-ai/sdk";
import { createInterface } from "node:readline/promises";
import { AddressChangeSession } from "./agent.ts";

const customerId = process.argv[2] ?? "KH01";
const session = new AddressChangeSession(new Anthropic(), customerId);
const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log(`ShopFast - hỗ trợ đổi địa chỉ giao hàng (khách ${customerId}). Gõ "thoat" để kết thúc.`);
while (true) {
  const text = (await rl.question("\nBạn: ")).trim();
  if (!text) continue;
  if (text.toLowerCase() === "thoat") break;
  try {
    console.log(`ShopFast: ${await session.send(text)}`);
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.log("ShopFast: Hệ thống đang bận, bạn vui lòng thử lại sau ít phút nhé.");
    } else {
      console.log("ShopFast: Đã có lỗi xảy ra, bạn vui lòng thử lại.");
    }
    console.error(err);
  }
}
rl.close();

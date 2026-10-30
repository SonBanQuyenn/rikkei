// Test voi model gia lap (khong can API key)
import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { MAX_ITERATIONS, OpsAssistant } from "../src/agent/orchestrator.ts";
import { getOvernightSummary } from "../src/services/reportService.ts";
import { products } from "../src/data/mockDb.ts";

function message(content: object[], stop_reason: string): Anthropic.Message {
  return { id: "m", type: "message", role: "assistant", model: "x", content, stop_reason, stop_sequence: null, usage: {} } as unknown as Anthropic.Message;
}
const toolUse = (id: string, name: string, input: object) => ({ type: "tool_use", id, name, input });
const text = (t: string) => ({ type: "text", text: t });

function fakeClient(next: (call: number, params: Anthropic.MessageCreateParamsNonStreaming) => Anthropic.Message) {
  const calls: Anthropic.MessageCreateParamsNonStreaming[] = [];
  const client = {
    messages: {
      create: async (params: Anthropic.MessageCreateParamsNonStreaming) => {
        calls.push(structuredClone(params));
        return next(calls.length, params);
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const lastToolResult = (params: Anthropic.MessageCreateParamsNonStreaming) => {
  const last = params.messages.at(-1)!.content as Anthropic.ToolResultBlockParam[];
  return last[0];
};

test("Tổng hợp đêm qua phát hiện đủ 4 loại bất thường từ dữ liệu", () => {
  const s = getOvernightSummary();
  assert.equal(s.anomalies.length, 4);
  assert.match(s.anomalies[0], /VNPAY/);
  assert.equal(s.stuckOrders, 5);
});

test("Thao tác ghi bị TỪ CHỐI thì không chạy", async () => {
  const { client, calls } = fakeClient((n) =>
    n === 1
      ? message([toolUse("t1", "pause_product_sales", { sku: "SKU-AO-KHOAC-07", reason: "hết hàng" })], "tool_use")
      : message([text("Đã giữ nguyên, chưa ngừng bán.")], "end_turn"),
  );
  const asked: string[] = [];
  const assistant = new OpsAssistant(client, async (action) => (asked.push(action), false));
  await assistant.ask("Ngừng bán áo khoác đi");
  assert.equal(asked.length, 1);
  assert.match(asked[0], /SKU-AO-KHOAC-07/);
  assert.match(String(lastToolResult(calls[1]).content), /TỪ CHỐI/);
  assert.equal(products.find((p) => p.sku === "SKU-AO-KHOAC-07")!.onSale, true);
});

test("Thao tác ghi được XÁC NHẬN thì mới chạy", async () => {
  const { client } = fakeClient((n) =>
    n === 1
      ? message([toolUse("t1", "pause_product_sales", { sku: "SKU-TAI-NGHE-01", reason: "bán vượt tồn kho 4 cái" })], "tool_use")
      : message([text("Đã ngừng bán tai nghe.")], "end_turn"),
  );
  const assistant = new OpsAssistant(client, async () => true);
  assert.equal(await assistant.ask("Xử lý tai nghe bán vượt kho"), "Đã ngừng bán tai nghe.");
  assert.equal(products.find((p) => p.sku === "SKU-TAI-NGHE-01")!.onSale, false);
});

test("Tool chỉ đọc không hỏi xác nhận; lỗi nghiệp vụ trả is_error cho model", async () => {
  const { client, calls } = fakeClient((n) =>
    n === 1
      ? message([toolUse("t1", "list_stuck_orders", { minHours: 999 })], "tool_use")
      : message([text("Giá trị giờ không hợp lệ.")], "end_turn"),
  );
  let asked = 0;
  const assistant = new OpsAssistant(client, async () => (asked++, true));
  await assistant.ask("Đơn kẹt?");
  assert.equal(asked, 0);
  assert.equal(lastToolResult(calls[1]).is_error, true);
});

test(`Không chạy quá ${MAX_ITERATIONS} vòng lặp cho một yêu cầu`, async () => {
  const { client, calls } = fakeClient((n) => message([toolUse(`t${n}`, "get_stock_alerts", {})], "tool_use"));
  const answer = await new OpsAssistant(client, async () => true).ask("Kiểm tra tồn kho mãi mãi");
  assert.equal(calls.length, MAX_ITERATIONS);
  assert.match(answer, /nhiều hơn 8 bước/);
});

test("Lỗi API không làm crash, trả thông báo thân thiện", async () => {
  const client = {
    messages: {
      create: async () => {
        throw new Anthropic.APIConnectionError({ message: "offline" });
      },
    },
  } as unknown as Anthropic;
  const answer = await new OpsAssistant(client, async () => true).ask("Đêm qua có gì bất thường?");
  assert.match(answer, /Mất kết nối/);
});

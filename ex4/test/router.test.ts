// Test bo dinh tuyen voi model gia lap (khong can API key)
import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { prepareTicket } from "../src/preprocess.ts";
import { routeTicket } from "../src/router.ts";
import { MAX_TICKET_CHARS, MANUAL_QUEUE } from "../src/config.ts";

function message(content: object[], stop_reason: string): Anthropic.Message {
  return { id: "m", type: "message", role: "assistant", model: "x", content, stop_reason, stop_sequence: null, usage: {} } as unknown as Anthropic.Message;
}

type Handler = (params: Anthropic.MessageCreateParamsNonStreaming, signal: AbortSignal) => Promise<Anthropic.Message>;

function fakeClient(classify: Handler, resolve: Handler) {
  const seen: string[] = [];
  const client = {
    messages: {
      create: (params: Anthropic.MessageCreateParamsNonStreaming, opts: { signal: AbortSignal }) => {
        const isClassifier = !params.tools;
        seen.push(isClassifier ? "classifier" : "agent");
        return isClassifier ? classify(params, opts.signal) : resolve(params, opts.signal);
      },
    },
  } as unknown as Anthropic;
  return { client, seen };
}

const classifierReply = (issues: object[]): Handler => async () =>
  message([{ type: "text", text: JSON.stringify({ issues }) }], "end_turn");

const hang: Handler = (_p, signal) =>
  new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason)));

test("Bẫy ticket dài 4.000 từ: giữ phần đầu + tin nhắn mới nhất, không vượt giới hạn", () => {
  const history = Array.from({ length: 4000 }, (_, i) => `tu${i}`).join(" ");
  const raw = `Tiêu đề: hỏi đơn hàng\n${history}\nKhách: đổi địa chỉ đơn 5002 giúp mình`;
  const prepared = prepareTicket(raw);
  assert.equal(prepared.truncated, true);
  assert.ok(prepared.text.length < MAX_TICKET_CHARS + 100);
  assert.match(prepared.text, /^Tiêu đề: hỏi đơn hàng/);
  assert.match(prepared.text, /đổi địa chỉ đơn 5002 giúp mình$/);
  assert.match(prepared.text, /đã lược bớt \d+ ký tự/);
});

test("Ticket ngắn giữ nguyên", () => {
  assert.equal(prepareTicket("  Mã giảm giá   lỗi  ").text, "Mã giảm giá lỗi");
});

test("70% ticket chỉ cần gán nhãn: không gọi agent", async () => {
  const { client, seen } = fakeClient(
    classifierReply([{ summary: "Mã giảm giá lỗi", team: "KY_THUAT_TAI_KHOAN", needsLookup: false, orderId: "", sku: "" }]),
    hang,
  );
  const r = await routeTicket(client, "T1", "Mã giảm giá FREESHIP không áp dụng được");
  assert.deepEqual(seen, ["classifier"]);
  assert.equal(r.routes[0].team, "KY_THUAT_TAI_KHOAN");
  assert.equal(r.routes[0].method, "classifier");
});

test("Bẫy ticket 2 vấn đề: tách thành 2 tuyến, vấn đề cần tra cứu đi qua agent", async () => {
  const { client, seen } = fakeClient(
    classifierReply([
      { summary: "Hỏi tồn kho áo", team: "KHO_SAN_PHAM", needsLookup: false, orderId: "", sku: "SKU-AO-01" },
      { summary: "Bị trừ tiền 2 lần đơn 5001", team: "THANH_TOAN", needsLookup: true, orderId: "5001", sku: "" },
    ]),
    async (params) => {
      // Luot 1: tra thanh toan; luot 2: chot doi
      if (params.messages.length === 1) {
        return message([{ type: "tool_use", id: "t1", name: "get_payment", input: { orderId: "5001" } }], "tool_use");
      }
      return message(
        [{ type: "tool_use", id: "t2", name: "route_ticket", input: { team: "THANH_TOAN", reason: "charged=false, lỗi ngân hàng" } }],
        "tool_use",
      );
    },
  );
  const r = await routeTicket(client, "T3", "Áo SKU-AO-01 bao giờ có hàng? Đơn 5001 bị trừ tiền 2 lần");
  assert.equal(r.routes.length, 2);
  assert.deepEqual(r.routes.map((x) => [x.team, x.method]), [["KHO_SAN_PHAM", "classifier"], ["THANH_TOAN", "agent"]]);
  assert.deepEqual(seen, ["classifier", "agent", "agent"]);
});

test("Agent quá hạn 5s: dùng nhãn sơ bộ, vẫn trả kết quả đúng hạn", async () => {
  const { client } = fakeClient(
    classifierReply([{ summary: "Chưa nhận tiền hoàn", team: "THANH_TOAN", needsLookup: true, orderId: "5003", sku: "" }]),
    hang,
  );
  const r = await routeTicket(client, "T2", "Đơn 5003 chưa hoàn tiền", 200);
  assert.equal(r.routes[0].team, "THANH_TOAN");
  assert.equal(r.routes[0].method, "fallback");
  assert.equal(r.routes[0].note, "quá hạn thời gian phản hồi");
  assert.ok(r.latencyMs < 1000);
});

test("Bộ phân loại lỗi: đưa vào hàng đợi phân loại thủ công", async () => {
  const { client } = fakeClient(hang, hang);
  const r = await routeTicket(client, "T5", "abc", 200);
  assert.equal(r.routes[0].team, MANUAL_QUEUE);
});

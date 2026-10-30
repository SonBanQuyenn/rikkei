// Test case chung minh loi cua agent.buggy.ts va xac nhan agent.ts da sua.
// Model duoc gia lap bang kich ban response co dinh => test chay khong can API key.
import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { runAgent as runBuggy } from "../src/agent.buggy.ts";
import { runAgent as runFixed } from "../src/agent.ts";

type Block = Record<string, unknown>;

function message(content: Block[], stop_reason: Anthropic.Message["stop_reason"]): Anthropic.Message {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  } as unknown as Anthropic.Message;
}

const text = (t: string): Block => ({ type: "text", text: t });
const toolUse = (id: string, orderId: string): Block => ({
  type: "tool_use",
  id,
  name: "get_order_status",
  input: { orderId },
});

// Client gia: tra lan luot cac response trong kich ban, ghi lai tham so moi lan goi
function fakeClient(script: Anthropic.Message[]) {
  const calls: { live: Anthropic.MessageParam[]; snapshot: Anthropic.MessageParam[] }[] = [];
  const client = {
    messages: {
      create: async (params: { messages: Anthropic.MessageParam[] }) => {
        calls.push({ live: params.messages, snapshot: structuredClone(params.messages) });
        const next = script.shift();
        if (!next) throw new Error("Kịch bản giả lập đã hết response");
        return next;
      },
    },
  } as unknown as Anthropic;
  return { client, calls };
}

const ORDER_QUESTION = "Đơn 1024 của tôi đang ở đâu?";
const FINAL_ANSWER =
  "Đơn 1024 của bạn đang được giao, hiện ở Bưu cục Cầu Giấy, Hà Nội, dự kiến giao ngày 31/10/2026.";

const orderScript = () => [
  message([toolUse("toolu_1", "1024")], "tool_use"),
  message([text(FINAL_ANSWER)], "end_turn"),
];

const roles = (msgs: Anthropic.MessageParam[]) => msgs.map((m) => m.role);

test("Đối chứng: câu chào hỏi - cả hai bản đều trả lời được (model trả end_turn ngay)", async () => {
  const greeting = () => [message([text("Chào bạn! ShopFast có thể giúp gì cho bạn?")], "end_turn")];
  assert.equal(await runBuggy("Xin chào", fakeClient(greeting()).client), "Chào bạn! ShopFast có thể giúp gì cho bạn?");
  assert.equal(await runFixed("Xin chào", fakeClient(greeting()).client), "Chào bạn! ShopFast có thể giúp gì cho bạn?");
});

test("Lỗi 1 - không có vòng lặp: hỏi đơn 1024 thì bản lỗi trả chuỗi rỗng", async () => {
  const buggy = fakeClient(orderScript());
  const actual = await runBuggy(ORDER_QUESTION, buggy.client);
  assert.equal(actual, ""); // ket qua thuc te: im lang
  assert.equal(buggy.calls.length, 1); // chi goi model 1 lan, ket qua tool bi bo

  const fixed = fakeClient(orderScript());
  assert.equal(await runFixed(ORDER_QUESTION, fixed.client), FINAL_ANSWER); // ket qua dung
  assert.equal(fixed.calls.length, 2);
});

test("Lỗi 1b - model nói câu dẫn trước khi gọi tool: bản lỗi trả câu dẫn thay vì câu trả lời", async () => {
  const script = () => [
    message([text("Để mình kiểm tra đơn hàng cho bạn nhé."), toolUse("toolu_1", "1024")], "tool_use"),
    message([text(FINAL_ANSWER)], "end_turn"),
  ];
  assert.equal(await runBuggy(ORDER_QUESTION, fakeClient(script()).client), "Để mình kiểm tra đơn hàng cho bạn nhé.");
  assert.equal(await runFixed(ORDER_QUESTION, fakeClient(script()).client), FINAL_ANSWER);
});

test("Lỗi 2 - sai thứ tự lịch sử: tool_result được đẩy vào mà thiếu lượt assistant chứa tool_use", async () => {
  const buggy = fakeClient(orderScript());
  await runBuggy(ORDER_QUESTION, buggy.client);
  // Lich su ma ban loi de lai (neu goi model tiep se bi API tu choi 400)
  assert.deepEqual(roles(buggy.calls[0].live), ["user", "user"]);

  const fixed = fakeClient(orderScript());
  await runFixed(ORDER_QUESTION, fixed.client);
  const history = fixed.calls[1].snapshot;
  assert.deepEqual(roles(history), ["user", "assistant", "user"]);
  const toolResult = (history[2].content as Anthropic.ToolResultBlockParam[])[0];
  assert.equal(toolResult.tool_use_id, "toolu_1");
  assert.match(String(toolResult.content), /Cầu Giấy/);
});

test("Lỗi 3 - nhiều tool_use: bản lỗi tách mỗi tool_result thành một message user riêng", async () => {
  const script = () => [
    message([toolUse("toolu_a", "1024"), toolUse("toolu_b", "1025")], "tool_use"),
    message([text("Đơn 1024 đang giao, đơn 1025 đang chờ xác nhận.")], "end_turn"),
  ];
  const buggy = fakeClient(script());
  await runBuggy("Đơn 1024 và 1025 của tôi sao rồi?", buggy.client);
  assert.deepEqual(roles(buggy.calls[0].live), ["user", "user", "user"]);

  const fixed = fakeClient(script());
  assert.equal(await runFixed("Đơn 1024 và 1025 của tôi sao rồi?", fixed.client), "Đơn 1024 đang giao, đơn 1025 đang chờ xác nhận.");
  const history = fixed.calls[1].snapshot;
  assert.deepEqual(roles(history), ["user", "assistant", "user"]);
  assert.equal((history[2].content as unknown[]).length, 2); // ca 2 ket qua trong 1 message
});

test("Lỗi 4 - không xét stop_reason: câu trả lời bị cắt (max_tokens) vẫn được trả như câu hoàn chỉnh", async () => {
  const script = () => [message([text("Đơn 1024 của bạn đang")], "max_tokens")];
  assert.equal(await runBuggy(ORDER_QUESTION, fakeClient(script()).client), "Đơn 1024 của bạn đang");
  await assert.rejects(runFixed(ORDER_QUESTION, fakeClient(script()).client), /stop_reason=max_tokens/);
});

test("Bản sửa: tool lỗi được báo lại cho model (is_error) thay vì làm sập agent", async () => {
  const script = () => [
    message([toolUse("toolu_x", "9999")], "tool_use"),
    message([text("Mình không tìm thấy đơn 9999, bạn kiểm tra lại mã đơn giúp mình nhé.")], "end_turn"),
  ];
  await assert.rejects(runBuggy("Đơn 9999 đâu rồi?", fakeClient(script()).client), /Không tìm thấy/);

  const fixed = fakeClient(script());
  assert.match(await runFixed("Đơn 9999 đâu rồi?", fixed.client), /không tìm thấy đơn 9999/);
  const toolResult = (fixed.calls[1].snapshot[2].content as Anthropic.ToolResultBlockParam[])[0];
  assert.equal(toolResult.is_error, true);
});

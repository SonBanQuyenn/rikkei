import { test } from "node:test";
import assert from "node:assert/strict";
import { createRefundApiTool, createRefundTool, validateRefundInput } from "../src/refundTool.ts";
import { createRefund } from "../src/refundService.ts";

test("Lược đồ: đủ 5 chỗ khuyết", () => {
  const schema = createRefundTool.input_schema;
  assert.match(createRefundTool.description, /HANG_LOI/);
  assert.equal(schema.properties.amount.maximum, 5_000_000);
  assert.deepEqual(schema.properties.reason.enum, ["HANG_LOI", "GIAO_CHAM", "TRU_TIEN_2_LAN"]);
  assert.deepEqual(schema.required, ["orderId", "amount", "reason"]);
  assert.equal(schema.additionalProperties, false);
});

test("Bản gửi API bật strict và không còn minimum/maximum (strict mode chưa hỗ trợ)", () => {
  assert.equal(createRefundApiTool.strict, true);
  const amount = (createRefundApiTool.input_schema.properties as Record<string, Record<string, unknown>>).amount;
  assert.equal(amount.minimum, undefined);
  assert.equal(amount.maximum, undefined);
});

test("Yêu cầu hợp lệ tạo được phiếu", () => {
  const ticket = createRefund({ orderId: "1024", amount: 1_500_000, reason: "HANG_LOI" });
  assert.match(ticket.ticketId, /^RF-\d{4}$/);
});

test("Chặn 50 triệu (vượt hạn mức)", () => {
  const r = validateRefundInput({ orderId: "1025", amount: 50_000_000, reason: "HANG_LOI" });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /vượt hạn mức/);
});

test("Chặn lý do ngoài danh sách (khách không thích màu)", () => {
  const r = validateRefundInput({ orderId: "1025", amount: 100_000, reason: "KHACH_KHONG_THICH_MAU" });
  assert.equal(r.ok, false);
});

test("Bẫy \"5tr\": amount = 5 bị từ chối rõ ràng, không bao giờ tạo phiếu 5 đồng", () => {
  const r = validateRefundInput({ orderId: "1026", amount: 5, reason: "TRU_TIEN_2_LAN" });
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /5\.000\.000đ/);
  assert.throws(() => createRefund({ orderId: "1026", amount: 5, reason: "TRU_TIEN_2_LAN" }));
  assert.equal(validateRefundInput({ orderId: "1026", amount: 5_000_000, reason: "TRU_TIEN_2_LAN" }).ok, true);
});

test("Chặn trường lạ, thiếu trường, sai kiểu", () => {
  assert.equal(validateRefundInput({ orderId: "1", amount: 10_000, reason: "GIAO_CHAM", note: "x" }).ok, false);
  assert.equal(validateRefundInput({ orderId: "1", amount: 10_000 }).ok, false);
  assert.equal(validateRefundInput({ orderId: "1", amount: "5tr", reason: "GIAO_CHAM" }).ok, false);
  assert.equal(validateRefundInput({ orderId: "1", amount: 10_000.5, reason: "GIAO_CHAM" }).ok, false);
});

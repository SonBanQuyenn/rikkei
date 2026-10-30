# Bài 6 – Điền khuyết lược đồ tool `create_refund`

## 5 chỗ khuyết đã điền (`src/refundTool.ts`)

| # | Chỗ khuyết | Đã điền |
|---|---|---|
| 1 | Mô tả quá sơ sài | Mô tả đủ ngữ cảnh: chỉ hoàn theo 3 lý do `HANG_LOI`, `GIAO_CHAM`, `TRU_TIEN_2_LAN`; lý do khác (không thích màu, đổi ý) thì **không gọi tool** mà giải thích cho người dùng; hạn mức 1.000đ – 5.000.000đ/phiếu; `amount` tính bằng **đồng**, phải quy đổi đơn vị rút gọn (`5tr` = 5000000, `500k` = 500000); thiếu mã đơn, lý do hoặc không chắc đơn vị thì hỏi lại. |
| 2 | `amount` không giới hạn | `type: "integer"`, `minimum: 1000`, `maximum: 5000000` |
| 3 | `reason` không ràng buộc | `enum: ["HANG_LOI", "GIAO_CHAM", "TRU_TIEN_2_LAN"]` |
| 4 | Thiếu trường bắt buộc | `required: ["orderId", "amount", "reason"]` |
| 5 | Thiếu chặn trường lạ | `additionalProperties: false` |

## Chế độ kiểm tra nghiêm ngặt

- Tool gửi lên API (`createRefundApiTool`) bật `strict: true`, nên model luôn sinh tham số đúng kiểu, đúng `enum`, đủ trường bắt buộc và không có trường lạ.
- Strict mode chưa hỗ trợ `minimum`/`maximum`. Vì vậy bản gửi lên API bỏ 2 ràng buộc này, còn hạn mức vẫn được ghi trong `description`.
- Phía server luôn kiểm tra lại **toàn bộ** lược đồ gốc (`validateRefundInput`) trước khi tạo phiếu. Tham số sai sẽ không tạo phiếu và được trả về cho model dưới dạng `tool_result` có `is_error: true`, để model giải thích rõ cho người dùng.

## Bẫy dữ liệu "cho tôi hoàn 5tr"

Có 2 lớp bảo vệ:

1. `description` dạy model quy đổi `5tr` → `5000000`, hoặc hỏi lại nếu không chắc đơn vị.
2. Nếu model vẫn truyền `amount: 5`, server từ chối với thông báo: *"Số tiền 5đ nhỏ hơn mức tối thiểu 1.000đ. Có thể đơn vị bị hiểu sai (ví dụ "5tr" phải là 5.000.000đ), hãy xác nhận lại với người dùng."* Không bao giờ có phiếu 5 đồng.

## Log chạy thử

`npm start` chạy agent thật với 3 yêu cầu và ghi log từng bước (câu hỏi, response của model, tool call, tool bị từ chối, câu trả lời cuối) vào thư mục `logs/`:

| File log | Yêu cầu |
|---|---|
| `logs/run-1-hop-le.log` | Đơn 1024 khách nhận hàng bị vỡ màn hình, hoàn cho khách 1.500.000đ. |
| `logs/run-2-khong-thich-mau.log` | Đơn 1025 hoàn 50 triệu vì khách không thích màu. |
| `logs/run-3-don-vi-rut-gon.log` | Đơn 1026 bị trừ tiền 2 lần, cho tôi hoàn 5tr. |

```bash
npm install
npm start      # cần ANTHROPIC_API_KEY, ghi log vào logs/
npm test       # kiểm tra lược đồ và các bẫy dữ liệu, không cần API key
```

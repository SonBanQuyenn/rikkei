# Bài 5 – Agent dừng sai thời điểm

## Phần 1 – Chỉ ra lỗi bằng dữ liệu

Luồng thực thi của `src/agent.buggy.ts` (bản gốc):

1. Tạo `messages = [user]`, gọi model **đúng 1 lần**.
2. Nếu model trả `tool_use` → chạy tool, đẩy `tool_result` vào `messages`… rồi **không gọi model lần nào nữa**.
3. Trả về text block đầu tiên của response đầu tiên (hoặc `""`).

Với câu chào hỏi, model trả `end_turn` ngay ở bước 1 nên kết quả trông đúng. Với câu hỏi về đơn hàng, model trả `stop_reason = "tool_use"` (thường không kèm text), nên agent trả về chuỗi rỗng. Đây đúng là hiện tượng CSKH báo.

| # | Khiếm khuyết | Câu hỏi đầu vào | Kết quả thực tế (bản lỗi) | Kết quả đúng |
|---|---|---|---|---|
| 1 | **Không có vòng lặp.** Kết quả tool không được gửi lại cho model, agent kết thúc sau 1 lần gọi. | `Đơn 1024 của tôi đang ở đâu?` | `""` (model gọi `get_order_status`, kết quả tool bị bỏ) | `Đơn 1024 của bạn đang được giao, hiện ở Bưu cục Cầu Giấy, Hà Nội, dự kiến giao ngày 31/10/2026.` |
| 1b | Cùng gốc với lỗi 1: model nói câu dẫn rồi mới gọi tool. | `Đơn 1024 của tôi đang ở đâu?` | `Để mình kiểm tra đơn hàng cho bạn nhé.` (câu dẫn bị coi là câu trả lời) | Câu trả lời có trạng thái/vị trí đơn như trên |
| 2 | **Sai thứ tự message trong lịch sử.** `tool_result` được đẩy vào mà **không có lượt `assistant` chứa `tool_use`** đứng trước. | `Đơn 1024 của tôi đang ở đâu?` | Lịch sử: `[user, user(tool_result)]`. Nếu gọi model tiếp, API trả lỗi 400 vì `tool_result` không khớp với `tool_use` nào. | `[user, assistant(tool_use), user(tool_result)]` |
| 3 | **Mỗi `tool_result` thành một message user riêng.** Các kết quả của cùng một lượt phải nằm chung một message. | `Đơn 1024 và 1025 của tôi sao rồi?` (model gọi 2 tool song song) | Lịch sử: `[user, user, user]` | `[user, assistant(2 tool_use), user(2 tool_result)]` |
| 4 | **Điều kiện kết thúc sai: không xét `stop_reason`.** Lượt hội thoại kết thúc bất kể model dừng vì lý do gì. | `Đơn 1024 của tôi đang ở đâu?` (model bị cắt vì `max_tokens`) | `Đơn 1024 của bạn đang` (câu bị cắt được trả cho khách như câu hoàn chỉnh) | Chỉ kết thúc khi `stop_reason === "end_turn"`. Các trường hợp khác phải lặp tiếp (`tool_use`, `pause_turn`) hoặc báo lỗi rõ ràng (`max_tokens`, `refusal`). |
| 5 | Tool lỗi làm sập cả agent (không có `is_error`). | `Đơn 9999 đâu rồi?` | Ném exception `Không tìm thấy đơn hàng 9999` | Gửi `tool_result` có `is_error: true` để model báo lại cho khách: `Mình không tìm thấy đơn 9999…` |

Mọi dòng trong bảng đều có test tương ứng trong `test/agent.test.ts`. Test chạy cả bản lỗi lẫn bản sửa với cùng một kịch bản response giả lập của model, nên không cần API key:

```bash
npm install
npm test
```

## Phần 2 – Source code đã sửa

Bản sửa nằm ở `src/agent.ts`:

- Lặp `messages.create` cho tới khi `stop_reason === "end_turn"`, giới hạn tối đa `MAX_TURNS` vòng.
- Sau mỗi response, đẩy **toàn bộ** `response.content` vào lịch sử với `role: "assistant"` **trước khi** đẩy `tool_result`.
- Gom tất cả `tool_result` của một lượt vào **một** message `user`. Tool lỗi được trả về với `is_error: true`.
- `pause_turn`: gửi lại để model làm tiếp. Các `stop_reason` khác (`max_tokens`, `refusal`…) thì ném lỗi rõ ràng, không trả câu dở dang cho khách.
- Câu trả lời cuối là toàn bộ text block của response `end_turn`.

Chạy thật với API (cần `ANTHROPIC_API_KEY`):

```bash
npm start                                  # mặc định hỏi "Đơn 1024 của tôi đang ở đâu?"
npm start -- "Đơn 1025 của tôi đang ở đâu?"
```

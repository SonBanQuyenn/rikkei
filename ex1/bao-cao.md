# Bài tập 5 – Vá lỗi khách hàng nhận được đơn hàng của người khác

Mã gốc: `src/order.gateway.buggy.ts` · Bản đã sửa: `src/order.gateway.ts`
Kịch bản kiểm thử tự động: `test/order.gateway.test.ts` (`npm test`), chạy cùng một kịch bản trên cả hai bản.

## Phần 1 – Chỉ ra lỗi bằng dữ liệu

### Khiếm khuyết 1 – Phát sự kiện cho toàn bộ server (rò rỉ dữ liệu sang người khác)

`notifyStatusChanged` gọi `this.server.emit(...)`, tức là gửi tới **mọi** socket đang kết nối. Map `tracked` được ghi nhưng không hề được dùng khi phát.

| Bước | Thao tác |
|---|---|
| 1 | Mở tab A (khách An), gửi `order:track` với `DH-001` |
| 2 | Mở tab B (khách Bình), gửi `order:track` với `DH-002` |
| 3 | Đơn `DH-001` đổi sang `SHIPPING` → `notifyStatusChanged('DH-001','SHIPPING')` |

| | Tab A | Tab B |
|---|---|---|
| Kết quả đúng | `{orderId:'DH-001',status:'SHIPPING'}` | *(không nhận gì)* |
| Kết quả thực tế (bản lỗi) | `{orderId:'DH-001',status:'SHIPPING'}` | `{orderId:'DH-001',status:'SHIPPING'}` ❌ |

Biến thể (K4): mở một tab không theo dõi đơn nào, cập nhật 20 đơn bất kỳ → kết quả đúng: 0 sự kiện; thực tế: tab nhận đủ **20** sự kiện. Mỗi tab phải nhận và xử lý mọi đơn hàng của toàn hệ thống, vì vậy tab càng mở lâu càng chậm.

### Khiếm khuyết 2 – Rò rỉ tài nguyên: `tracked` không bao giờ được dọn

`handleDisconnect` chỉ `console.log`, không xoá `tracked.delete(client.id)`. Mỗi lần kết nối có `client.id` mới (F5, mất mạng, nối lại…) nên Map chỉ tăng, không giảm.

| Bước | Thao tác |
|---|---|
| 1 | Mở 50 tab, mỗi tab theo dõi một đơn `DH-0..DH-49` |
| 2 | Đóng cả 50 tab, chờ server xử lý disconnect |
| 3 | Kiểm tra `tracked.size` |

| Kết quả đúng | Kết quả thực tế (bản lỗi) |
|---|---|
| `0` | `50` ❌ (bộ nhớ server tăng mãi theo số lượt kết nối) |

### Khiếm khuyết 3 – Một client chỉ lưu được một đơn (ghi đè)

`tracked` là `Map<clientId, orderId>` nên theo dõi đơn thứ 2 sẽ ghi đè đơn thứ nhất.

| Bước | Kết quả đúng | Thực tế |
|---|---|---|
| 1 tab gửi `order:track DH-001` rồi `order:track DH-002` | tab theo dõi cả 2 đơn | `tracked.get(id) === 'DH-002'` ❌ – mất `DH-001` |

Lỗi này đang bị khiếm khuyết 1 che đi (vì broadcast cho tất cả nên ai cũng nhận), nhưng sẽ lộ ra ngay khi chỉ sửa cách phát dựa trên Map.

## Phần 2 – Source code đã sửa

Ý tưởng: dùng **room của Socket.IO** cho mỗi đơn hàng (`order:<orderId>`), bỏ hẳn Map tự quản lý.

- `order:track` → `client.join('order:<id>')`; một client có thể ở nhiều room → theo dõi nhiều đơn.
- `notifyStatusChanged` → `server.to('order:<id>').emit(...)` → **phạm vi phát** chỉ là những socket đang theo dõi đúng đơn đó.
- Khi client rời đi, Socket.IO tự gỡ socket khỏi mọi room; room rỗng bị xoá → **không còn gì sót lại** sau disconnect. Gateway không giữ trạng thái riêng nên không có gì phải dọn trong `handleDisconnect`.
- Thêm `order:untrack` để rời room khi người dùng đóng trang chi tiết đơn, và kiểm tra `orderId` hợp lệ.

Kết quả chạy cùng kịch bản trên bản đã sửa:

| Kịch bản | Bản lỗi | Bản sửa |
|---|---|---|
| K1 – Tab B nhận đơn của A | nhận ❌ | không nhận ✅ |
| K2 – Trạng thái sau khi 50 tab đóng | 50 bản ghi ❌ | 0 room, 0 socket ✅ |
| K3 – Theo dõi 2 đơn | chỉ còn 1 ❌ | nhận đủ 2 ✅ |
| K4 – Tab không theo dõi gì, 20 cập nhật | nhận 20 ❌ | nhận 0 ✅ |

```
npm install
npm test     # 9/9 pass
npm start    # PATCH http://localhost:3000/orders/DH-001/status  {"status":"SHIPPING"}
```

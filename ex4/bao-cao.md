# Bài tập 8 – Chọn chiến lược ghi cho tồn kho thời gian thực

Mã nguồn: `src/` · Kiểm thử: `npm test` · Đo tải: `npm run bench` → `logs/benchmark.log` · Chạy thử: `npm start`

## A. Phân tích & đề xuất đa giải pháp

### Đầu vào / đầu ra

| | Nội dung |
|---|---|
| **Đầu vào** | Yêu cầu đặt hàng `{productId, userId, qty}` – ~400 lượt/giây vào **cùng một sản phẩm**; yêu cầu huỷ đơn `{orderId}` |
| **Đầu ra** | Kết quả đặt hàng trong ≤ 500 ms: thành công (`orderId`, số còn lại) hoặc `409` hết hàng; trạng thái huỷ |
| **Dữ liệu bền vững** | Bảng `orders` (mỗi đơn một dòng), dòng `products.stock` của sản phẩm |
| **Ràng buộc** | Dòng `products.stock` chỉ chịu ~150 lần ghi/giây (khoá dòng); Redis có thể khởi động lại; đơn có thể bị huỷ |

### Ràng buộc khó thoả mãn nhất

**“Tuyệt đối không bán vượt tồn kho”** khi nhu cầu ghi (400/s) vượt sức chịu của dòng dữ liệu (150/s). Muốn không bán vượt thì phép “kiểm tra còn hàng + trừ kho” phải **nguyên tử trên một nguồn duy nhất**. Nếu nguồn đó là dòng CSDL thì bị giới hạn 150/s → hàng đợi khoá dòng dài ra → vỡ 500 ms. Nếu nguồn đó là Redis thì nhanh nhưng **Redis có thể mất dữ liệu khi khởi động lại** → lần đếm sau có thể cho bán lại những gì đã bán. Hai bẫy dữ liệu đều đánh đúng vào ràng buộc này.

### Các giải pháp

| | Giải pháp | Cách làm |
|---|---|---|
| (a) | **Ghi thẳng CSDL** | Mỗi đơn: `UPDATE products SET stock = stock - :qty WHERE id = :id AND stock >= :qty`, sau đó `INSERT` đơn. |
| (b) | **Ghi đồng thời Redis + CSDL** | Redis `DECRBY` có kiểm tra (Lua) để chặn bán vượt, rồi ghi ngay dòng `products` trong cùng request. |
| (c) | **Redis trước, đồng bộ CSDL theo lô** (*đã chọn, có gia cố*) | Redis trừ kho nguyên tử bằng Lua; **mỗi đơn vẫn được `INSERT` ngay vào bảng `orders`** (mỗi đơn một dòng riêng, không tranh khoá); dòng `products.stock` được cập nhật **theo lô mỗi 1 giây** bằng một lệnh duy nhất. |

## B. So sánh & lựa chọn

Số đo lấy từ `logs/benchmark.log` (400 đơn/giây × 2 giây = 800 đơn, kho 600, dòng `products` chịu 150 ghi/giây):

| Tiêu chí | (a) Ghi thẳng CSDL | (b) Ghi đồng thời | (c) Redis + đồng bộ theo lô |
|---|---|---|---|
| **Độ trễ cảm nhận của khách** | p50 1153 ms, p99 2214 ms ❌ – và **tăng tuyến tính** theo thời gian chiến dịch vì hàng đợi khoá dòng chỉ xả 150/s | p50 525 ms, p99 1584 ms ❌ – đơn hết hàng trả nhanh, nhưng đơn thành công vẫn phải xếp hàng ghi dòng | p50 28 ms, p99 34 ms ✅ |
| **Khả năng chịu 400 ghi/giây** | ❌ 800 lần ghi dòng nóng – ở mức 150/s cần 5,3 s để xả 2 s tải | ❌ 600 lần ghi dòng nóng | ✅ 3 lần ghi dòng nóng (1 lần/giây), `INSERT` đơn không tranh khoá |
| **Rủi ro mất dữ liệu khi Redis khởi động lại** | Không có (không dùng Redis) | Thấp: CSDL luôn đúng, nhưng Redis mất thì phải nạp lại số đếm | **Không mất đơn**: mọi đơn đã nằm trong `orders` trước khi trả lời khách; Redis được dựng lại từ CSDL (xem C) |
| **Độ phức tạp cài đặt & vận hành** | Thấp nhất | Trung bình: 2 nơi ghi đồng bộ, cần xử lý lệch khi bước 2 lỗi | Cao nhất: script Lua, worker đồng bộ, quy trình dựng lại Redis, theo dõi độ trễ đồng bộ |
| **Không bán vượt** | ✅ (điều kiện `stock >= qty`) | ✅ (Redis gate) | ✅ (Redis gate + dựng lại thận trọng) |
| **CSDL khớp tuyệt đối sau chiến dịch** | ✅ | ✅ | ✅ (sau lần đồng bộ cuối) |

### Chốt lựa chọn: (c)

- (a) và (b) đều bắt mỗi đơn thành công phải ghi lên dòng nóng → bị chặn trần 150/s, **không thể đạt 500 ms ở 400/s** dù code tối ưu cỡ nào (hàng đợi tăng mãi). Đây là giới hạn vật lý chứ không phải chi tiết cài đặt.
- (c) tách hai việc vốn bị gộp: **quyết định bán** (cần nguyên tử, nhanh → Redis Lua, đơn luồng nên không thể có hai request cùng thấy “còn 1”) và **ghi sổ** (cần bền vững → `INSERT` mỗi đơn một dòng, chịu tải tốt; dòng tồn kho chỉ cộng dồn theo lô).
- Điểm yếu của (c) ở dạng thường gặp (write-behind thuần) là mất dữ liệu khi Redis chết. Phiên bản ở đây **ghi đơn vào CSDL trước khi trừ trên Redis**, nên CSDL luôn đủ thông tin để dựng lại Redis mà **không bao giờ bán vượt**. Đổi lại độ phức tạp cao hơn – chấp nhận được vì ràng buộc “không bán vượt” là tuyệt đối.

## C. Thiết kế & triển khai

### Các bước đặt hàng (`InventoryService.placeOrder`)

1. Kiểm tra `qty` (1..5), sản phẩm tồn tại.
2. `INSERT` đơn vào `orders` với trạng thái `PENDING` (**ghi CSDL trước**).
3. Gọi script Lua `RESERVE` trên Redis – **nguyên tử**:
   - khoá tồn kho không tồn tại → `MISSING` → dựng lại từ CSDL rồi thử lại;
   - đơn đã nằm trong tập `held` → đã trừ rồi, không trừ lần nữa;
   - đơn nằm trong tập `provisional` (lần dựng lại đã trừ tạm) → chỉ nhận nếu tồn kho sau khi trừ tạm vẫn ≥ 0, ngược lại cộng trả và từ chối;
   - `stock < qty` → `OUT_OF_STOCK`;
   - còn lại: `DECRBY`, thêm đơn vào `held`.
4. Hết hàng / lỗi Redis → đơn chuyển `REJECTED`, gọi `RELEASE` để chắc chắn không giữ chỗ thừa → `409`.
5. Thành công → đơn chuyển `CONFIRMED`, trả về cho khách (~28 ms).

Vì sao trừ kho là nguyên tử: Redis thực thi mỗi script Lua trọn vẹn, đơn luồng – không có request nào xen giữa “đọc tồn kho” và “trừ tồn kho”, kể cả khi có nhiều instance ứng dụng.

### Đồng bộ dòng tồn kho (`StockSyncWorker`, mỗi 1 giây)

Trong **một transaction**: cộng dồn mọi đơn `CONFIRMED` chưa trừ (`stockApplied = false`) và mọi đơn `CANCELLED` đã trừ nhưng chưa hoàn → **một** lệnh `UPDATE products` → đánh dấu đã áp dụng. Khi app dừng (`onModuleDestroy`) chạy lần cuối → **CSDL khớp tuyệt đối với số đã bán**.

### Bẫy 1 – Redis khởi động lại giữa chiến dịch

Khi khoá tồn kho mất, một instance giành khoá dựng lại (`SET … NX PX 5000`), các instance khác chờ và thử lại (có giới hạn). Số liệu dựng lại đọc **từ CSDL**:

```
khả dụng = products.stock
         − Σ qty đơn CONFIRMED chưa trừ vào dòng
         − Σ qty đơn PENDING                      (trừ tạm → tập provisional)
         + Σ qty đơn CANCELLED đã trừ nhưng chưa hoàn
held        = các đơn CONFIRMED
provisional = các đơn PENDING
```

- Đơn `PENDING` có thể đã được Redis cũ cho qua (khách sắp nhận “thành công”) → **phải trừ** để không bán vượt.
- Nhưng cũng có thể chưa từng được kiểm tra → nên chỉ **trừ tạm**: khi request của đơn đó tới Redis mới, script vẫn kiểm tra lại (tồn kho sau khi trừ tạm ≥ 0 mới nhận). Nhờ vậy 300 đơn `PENDING` với kho 200 vẫn chỉ nhận đúng 200 (có test).
- Script ghi dữ liệu dựng lại chỉ chạy khi khoá vẫn chưa có → hai instance không ghi đè nhau.

### Bẫy 2 – Đơn bị huỷ giữa chừng

1. `UPDATE orders SET status='CANCELLED' WHERE id=:id AND status='CONFIRMED'` – chỉ một lời gọi đổi được trạng thái; huỷ lần 2 trả về luôn, không hoàn thêm.
2. Script `RELEASE`: chỉ `INCRBY` nếu `SREM` đơn khỏi `held`/`provisional` trả về 1 → huỷ đồng thời 3 lần vẫn chỉ hoàn 1 lần. Nếu đúng lúc Redis vừa mất dữ liệu thì dựng lại trước rồi mới hoàn (lần dựng lại đã thấy đơn `CANCELLED` nên không có trong `held` → không cộng hai lần).
3. Dòng `products` được cộng trả ở lần đồng bộ kế tiếp (nếu đơn đã từng được trừ).

### Mã nguồn

| File | Vai trò |
|---|---|
| `src/inventory/stock-cache.ts` | Truy cập Redis: script Lua `RESERVE`, `RELEASE`, `REBUILD`, khoá dựng lại |
| `src/inventory/inventory.service.ts` | Đặt hàng, huỷ đơn, dựng lại tồn kho |
| `src/inventory/stock-sync.worker.ts` | Đồng bộ dòng `products.stock` theo lô |
| `src/db/inventory.db.ts` | CSDL giả lập: dòng `products` có khoá dòng 150 ghi/giây, bảng `orders` |
| `src/strategies/alternatives.ts` | Giải pháp (a), (b) – chỉ dùng để đo so sánh |
| `src/app.ts` | `POST /orders`, `POST /orders/:id/cancel`, `GET /products/:id/stock` |

### Kết quả kịch bản có bẫy (`logs/benchmark.log`)

```
## (c) DA CHON + bay: Redis khoi dong lai, huy don giua chung
don gui: 800 | thanh cong: 600 | het hang: 102 | loi: 0
do tre (ms): p50=28 p95=33 p99=43 max=62
so lan ghi dong products: 4
ton kho CSDL cuoi: 0 | da ban (don CONFIRMED): 600 | 600 - 600 = 0 -> KHOP
ban vuot ton kho: khong
Redis khoi dong lai giua chung: co | don bi huy: 98
ton kho kha dung trong Redis cuoi: 0 (phai bang ton kho CSDL)
```

698 đơn đặt thành công, 98 đơn bị huỷ giữa chừng (98 suất được bán lại cho khách khác), Redis mất toàn bộ dữ liệu ở giây thứ 1 → còn 600 đơn hiệu lực = đúng tồn kho, CSDL và Redis khớp nhau.

### Kiểm thử (`npm test`)

| Test | Kết quả |
|---|---|
| 300 đơn đồng thời, kho 200 → đúng 200 thành công, 100 nhận `409` | ✅ |
| Đơn nhiều sản phẩm không đủ hàng → từ chối cả đơn | ✅ |
| 400 đơn/giây → mọi phản hồi < 500 ms, dòng `products` < 20 lần ghi | ✅ |
| Redis mất dữ liệu giữa 200 đơn (kho 150) → đúng 150 thành công, CSDL khớp | ✅ |
| Đơn `PENDING` khi Redis mất → lần dựng lại trừ tạm, request tới sau không trừ lần 2 | ✅ |
| 5 đơn `PENDING` vượt kho 3 khi dựng lại → chỉ 3 đơn được nhận | ✅ |
| Dựng lại khi có đơn đã đồng bộ + đơn huỷ chưa đồng bộ + đơn mới → số khả dụng đúng | ✅ |
| Huỷ đơn → khách khác mua được đúng số lượng hoàn | ✅ |
| Huỷ 4 lần (3 lần đồng thời) → chỉ hoàn 1 lần | ✅ |
| Huỷ đơn đã đồng bộ → lần đồng bộ sau cộng trả dòng `products` | ✅ |
| Huỷ đúng lúc Redis vừa mất dữ liệu → hoàn đúng 1 lần | ✅ |
| Ghi đơn vào CSDL lỗi → không trừ kho | ✅ |
| HTTP: đặt, hết hàng `409`, số lượng sai `400`, huỷ, xem tồn kho | ✅ |

```
# tests 13
# pass 13
# fail 0
```

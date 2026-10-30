# Bài tập 8 – Chọn kỹ thuật cập nhật cho bảng điều khiển vận hành

| File | Nội dung |
|---|---|
| `src/metrics.service.ts` | Snapshot hiện tại, bộ đệm sự kiện gần nhất, phát sự kiện |
| `src/dashboard.controller.ts` | Endpoint SSE `GET /dashboard/stream` và trang `GET /` |
| `src/simulator.service.ts` | Giả lập dữ liệu: cao điểm 5s/lần, ban đêm 2 phút/lần |
| `src/config.ts` | Heartbeat 20s, retry 3s, bộ đệm 1000 sự kiện |
| `public/index.html` | Màn hình lớn trong kho (EventSource + watchdog) |
| `test/dashboard.test.ts` | Kiểm thử (`npm test`, 7/7 pass) |

---

## A. Phân tích & đề xuất đa giải pháp

### Đầu vào / đầu ra

- **Đầu vào**
  - Sự kiện nghiệp vụ phát sinh trên server: đơn mới (tăng số đơn, doanh thu) và cảnh báo hết hàng.
  - Tần suất: ~5 giây/lần lúc cao điểm, ~2 phút/lần ban đêm, có khi hàng giờ không có gì.
- **Đầu ra**
  - Màn hình lớn hiển thị số đơn mới, doanh thu và danh sách cảnh báo tồn kho, luôn mới nhất.
  - Khoảng 40 nhân viên xem, chỉ vài màn hình chạy liên tục.

### Đặc điểm quan trọng nhất của luồng dữ liệu

**Một chiều server → client, tần suất thấp và không đều.** Client không gửi gì lên. Vì vậy không cần kênh hai chiều; điều cần giải quyết là:
1. đẩy cảnh báo xuống nhanh (< 10s),
2. giữ kết nối sống qua những giờ không có dữ liệu (LB cắt kết nối sau 60s im lặng),
3. tự phục hồi và không mất sự kiện khi mạng rớt.

### Các giải pháp khả thi

| | Giải pháp | Mô tả |
|---|---|---|
| (a) | Polling theo chu kỳ | Màn hình gọi `GET /dashboard` mỗi N giây. Muốn cảnh báo < 10s thì N ≤ 10s (thực tế ~5s) |
| (b) | Server-Sent Events | Một kết nối HTTP dài, server đẩy sự kiện khi có; trình duyệt có sẵn `EventSource` (tự kết nối lại, tự gửi `Last-Event-ID`) |
| (c) | WebSocket (Socket.IO) | Kết nối song công đầy đủ, server đẩy sự kiện; client có thể gửi lên (không dùng tới) |

---

## B. So sánh & lựa chọn

| Tiêu chí | (a) Polling 5s | (b) SSE | (c) WebSocket |
|---|---|---|---|
| **Độ trễ** | Trung bình 2.5s, tệ nhất 5s + thời gian request. Đạt < 10s nhưng phụ thuộc chu kỳ | Gần như tức thời (ms) | Gần như tức thời (ms) |
| **Kết nối & tài nguyên server** | Không giữ kết nối, nhưng 40 màn hình × 12 req/phút = **~690.000 request/ngày**, phần lớn trả về “không đổi” (nhất là ban đêm) | 1 kết nối HTTP mở cho mỗi màn hình; ban đêm chỉ có heartbeat mỗi 20s (vài byte) | 1 kết nối/màn hình + bộ máy Socket.IO (ping/pong, rooms, handshake); nặng hơn SSE một chút |
| **Tự phục hồi khi rớt mạng** | Tự nhiên: request sau thất bại thì request kế tiếp chạy lại; nhưng sự kiện xảy ra rồi biến mất giữa 2 lần poll sẽ bị lỡ nếu chỉ đọc snapshot | **Có sẵn**: `EventSource` tự nối lại sau `retry:` ms và gửi `Last-Event-ID` → server phát bù đúng các sự kiện lỡ | Socket.IO tự nối lại, nhưng **phát bù sự kiện lỡ phải tự làm** (lưu offset, gửi lại) |
| **Ràng buộc LB 60s** | Không bị ảnh hưởng (request ngắn) | Phải gửi heartbeat < 60s, việc này đơn giản (một dòng `res.write`) | Ping mặc định 25s của Socket.IO đã < 60s; cần LB hỗ trợ Upgrade/sticky session khi chạy nhiều instance |
| **Độ phức tạp triển khai & vận hành** | Thấp nhất | Thấp: HTTP thuần, không thư viện client, đi qua proxy/LB như HTTP thường | Cao nhất: cần thư viện 2 phía, cấu hình Upgrade trên LB, adapter (Redis) khi scale ngang |

### Chốt: chọn (b) Server-Sent Events

Căn cứ vào 3 ràng buộc nghiệp vụ:

1. **Cảnh báo phải tới trong 10 giây**: SSE đẩy ngay khi phát sinh, độ trễ tính bằng mili-giây. Polling chỉ đạt khi chu kỳ ngắn, đổi lại phải chịu hàng trăm nghìn request thừa mỗi ngày.
2. **Chạy 24/7, không có người thao tác**
   - `EventSource` tự kết nối lại; `Last-Event-ID` giúp **không mất cảnh báo** phát ra đúng lúc mạng rớt.
   - Thêm watchdog phía trang cho trường hợp kết nối chết im lặng, hoặc LB trả lỗi khiến `EventSource` dừng hẳn. Không ai phải F5.
3. **LB giữ kết nối tối đa 60 giây khi không có dữ liệu**
   - Đây là ràng buộc quyết định, vì ban đêm có thể hàng giờ không có sự kiện nào. Một kết nối dài không có biện pháp gì sẽ bị LB cắt mỗi 60s.
   - Giải pháp: server gửi `event: heartbeat` **mỗi 20 giây**, nhỏ hơn 60s gấp 3 lần nên vẫn an toàn khi một nhịp bị trễ. Kết nối không bao giờ im lặng tới 60s.
   - Heartbeat không có `id`, nên không làm lệch `Last-Event-ID`.

WebSocket cũng đạt độ trễ nhưng là thừa: luồng dữ liệu chỉ một chiều. Nó còn tốn thêm cấu hình LB (Upgrade) và vẫn phải tự làm phần phát bù sự kiện. SSE cho đúng những gì bài toán cần với ít thành phần nhất.

---

## C. Thiết kế & triển khai

### Các bước thực hiện

1. **Nguồn dữ liệu (`MetricsService`)**
   - Giữ snapshot hiện tại (số đơn, doanh thu, 20 cảnh báo gần nhất).
   - Mỗi thay đổi tạo một sự kiện có `id` tăng dần, lưu vào **bộ đệm vòng** 1000 sự kiện rồi phát cho mọi listener.
   - Id có dạng `<bootId>.<seq>`, nên id của lần chạy server trước không bị hiểu nhầm.
2. **Endpoint SSE (`GET /dashboard/stream`)**
   1. Trả các header `text/event-stream`, `no-cache`, `X-Accel-Buffering: no` (proxy không gom sự kiện).
   2. Gửi `retry: 3000` để trình duyệt nối lại sau 3s.
   3. Nếu có `Last-Event-ID` (header do trình duyệt tự gửi, hoặc `?lastEventId=`) và id còn trong bộ đệm thì **phát bù** các sự kiện sau id đó. Ngược lại (kết nối mới, id quá cũ, id lần chạy trước) thì gửi **snapshot** đầy đủ.
   4. Đăng ký nhận sự kiện mới và đẩy ngay xuống.
   5. Gửi heartbeat mỗi 20s.
   6. Khi `req` đóng thì huỷ đăng ký và xoá timer, không rò rỉ.
3. **Màn hình (`public/index.html`)**
   - `EventSource` lắng nghe `snapshot`, `metrics`, `stock_alert`, `heartbeat`; ghi nhớ `lastEventId`; hiển thị trạng thái Trực tuyến / Mất kết nối.
   - Cảnh báo mới nhấp nháy đỏ.
   - **Watchdog**: quá 50s (2.5 lần heartbeat) không nhận gì thì tự đóng và mở lại kết nối kèm `lastEventId`.
   - `EventSource` ở trạng thái `CLOSED` (ví dụ LB trả 502) thì tự mở lại sau 3s.

### Xử lý hai bẫy dữ liệu

| Bẫy | Hậu quả nếu bỏ qua | Cách xử lý trong code | Test |
|---|---|---|---|
| Ban đêm hàng giờ không có thay đổi | LB cắt kết nối sau 60s im lặng; màn hình đứng mà không ai biết | Heartbeat 20s (`dashboard.controller.ts`) + watchdog phía trang | `ban dem khong co du lieu: heartbeat van chay deu…`, `cau hinh mac dinh: heartbeat < 60s…` |
| Mạng kho rớt vài giây rồi tự phục hồi | Lỡ cảnh báo phát ra đúng lúc rớt; trang đứng nếu không tự nối lại | `retry: 3000` → tự nối lại; `Last-Event-ID` → phát bù đúng sự kiện bị lỡ, theo đúng thứ tự; rớt quá lâu thì gửi snapshot | `mang rot vai giay: noi lai voi Last-Event-ID…`, `mat ket noi qua lau…: nhan lai snapshot` |

Ngoài ra còn kiểm tra: cảnh báo tới màn hình < 1s (yêu cầu 10s); server dọn sạch listener khi màn hình ngắt.

Luồng SSE khi chạy thử:

```
retry: 3000

id: mvv4f4fx.0
event: snapshot
data: {"newOrders":0,"revenue":0,"alerts":[],"updatedAt":1793373738045}

event: heartbeat
data: 1793373739105
```

```
npm install
npm test
npm start      # mo http://localhost:3000
```

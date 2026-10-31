# Bài tập 9 – Trung tâm điều hành tác vụ nền của ShopFast

Chạy:

- `npm start`: chạy hệ thống, bảng điều khiển ở `http://localhost:3000`; JSON ở `/api/dashboard`, `/api/alerts`.
- `npm run demo`: kịch bản demo, kết quả trong `logs/demo-run.log`.
- `npm test`: 9 kiểm thử.

Cần Redis tại `REDIS_URL`. Tùy chọn `ALERT_WEBHOOK_URL` để đẩy cảnh báo sang Slack/Teams.

## 1. Bản đặc tả ngắn – thu hẹp yêu cầu mở

Giám đốc kỹ thuật nêu ba vấn đề:

1. Không biết việc nào **đang chạy**.
2. Không biết việc nào **đã chết**.
3. Mất **3 ngày** mới phát hiện job đồng bộ tồn kho đã dừng.

Từ đó, bài làm thu hẹp thành 4 tác vụ đại diện cho 4 kiểu việc nền điển hình của sàn TMĐT:

| Tác vụ | Kiểu | Vì sao chọn |
|---|---|---|
| `send-otp`: gửi mã OTP đăng nhập/thanh toán | Gấp | Khách đang đứng chờ trên màn hình; chậm 10 giây là mất đơn |
| `export-report`: xuất báo cáo doanh thu tháng | Nặng, chạy lâu | Tốn CPU và thời gian, có tiến độ; không được làm nghẽn việc gấp |
| `inventory-sync`: đồng bộ tồn kho từ ERP mỗi 5 phút | Định kỳ | Chính là job đã "chết 3 ngày", cần phát hiện nó **không chạy** chứ không chỉ phát hiện nó **lỗi** |
| `bulk-price-update`: cập nhật giá theo lô 500 sản phẩm | Hàng loạt | Khối lượng lớn, phải hãm tốc độ để không đè cơ sở dữ liệu |

Hệ thống phải trả lời được:

- Mỗi hàng đợi có bao nhiêu việc đang chờ, đang chạy, đã xong, thất bại.
- Việc chờ lâu nhất đã chờ bao lâu, và có worker nào còn sống không.
- Tỉ lệ lỗi gần đây là bao nhiêu.
- Lần cuối việc định kỳ chạy thành công là khi nào.

Hệ thống chủ động cảnh báo khi một trong các điều trên vượt ngưỡng.

## 2. Thiết kế kiến trúc

```
  API / cron / admin                         ┌──────────────── Redis ────────────────┐
        │  ControlCenter.enqueue(task, data) │  shopfast-critical   (gấp)            │
        │  (jobId = khóa nghiệp vụ)          │  shopfast-heavy      (nặng)           │
        └───────────────────────────────────►│  shopfast-scheduled  (định kỳ) ◄─ Job Scheduler mỗi 5'
                                             │  shopfast-bulk       (hàng loạt)      │
                                             │  idem:*      khóa chống lặp           │
                                             │  metrics:*   bộ đếm khe 5s, nhịp tim  │
                                             └──────┬─────────────────────▲──────────┘
                                                    │ lấy job             │ completed / failed
                                            ┌───────▼─────────────────────┴───────┐
                                            │ Worker theo cấu hình từng hàng đợi  │
                                            │  process(): định tuyến job.name →   │
                                            │  TaskDefinition → parse (sai =      │
                                            │  Unrecoverable) → IdempotencyGuard  │
                                            │  .runOnce(khóa) → task.run(ports)   │
                                            └───────┬─────────────────────────────┘
                                                    │ SMS, ERP, CSDL, kho tệp (ports)
  ┌────────────────────────────┐   snapshot()   ┌───┴───────────────────────┐   firing / resolved / reminder
  │ HTTP (NestJS)              │◄───────────────│ AlertMonitor (mỗi 15s)     │──► LogNotifier, WebhookNotifier,
  │ GET /  (HTML, tự làm mới)  │                │ evaluateAlerts(snap, ngưỡng│    MemoryNotifier (lịch sử)
  │ GET /api/dashboard, alerts │                └────────────────────────────┘
  └────────────────────────────┘
```

Cấu trúc mã theo Clean Code. Định nghĩa hàng đợi, logic nghiệp vụ và cấu hình nằm tách riêng:

```
src/config/queues.config.ts      CẤU HÌNH: 4 hàng đợi (worker, job, ngưỡng cảnh báo, lý do), lịch định kỳ, nhịp giám sát
src/tasks/*.task.ts              NGHIỆP VỤ: mỗi tác vụ = parse + idempotencyKey + run, không biết gì về BullMQ
src/tasks/ports.ts, fakes.ts     cổng ra hệ thống ngoài (SMS, ERP, CSDL, kho tệp) và bản giả lập
src/queues/control-center.ts     HẠ TẦNG HÀNG ĐỢI: dựng queue/worker từ cấu hình, định tuyến, chống lặp, ghi số liệu
src/common/idempotency.ts        IdempotencyGuard
src/monitoring/                  metrics (bộ đếm khe 5 s), alert-rules (hàm thuần), alert-monitor (vòng giám sát), notifiers
src/http/                        bảng điều khiển NestJS (JSON + HTML)
src/bootstrap.ts, main.ts        lắp ráp hệ thống, chặn lỗi cấp tiến trình
```

### Bảng liệt kê từng hàng đợi

| Hàng đợi | Mục đích | Cấu hình | Lý do |
|---|---|---|---|
| `shopfast-critical` | Việc gấp: OTP | **Số lần thử:** 5<br>**Giãn cách:** lũy thừa 0,5 s → 8 s<br>**Song song:** 20<br>**Giới hạn tốc độ:** không<br>**Cảnh báo:** chờ > 50 job, job chờ > 10 s, lỗi > 20% (≥ 20 mẫu) | Việc ngắn (~100 ms) và nhạy độ trễ, nên song song cao và thử lại nhanh. OTP hết hạn sau khoảng 2 phút nên tổng thời gian thử lại phải dưới mức đó. Không hãm tốc độ |
| `shopfast-heavy` | Việc nặng: báo cáo tháng | **Số lần thử:** 3<br>**Giãn cách:** lũy thừa 30 s, 60 s<br>**Song song:** 2<br>**Khóa job:** 5 phút (tự gia hạn), `maxStalledCount` 1<br>**Cảnh báo:** chờ > 20 job, chờ > 15 phút, lỗi > 34% | Chỉ 2 việc song song để không ăn hết CPU và RAM. Khóa dài cho việc chạy lâu. Lỗi thường do CSDL quá tải nên thử lại thưa. Việc từng làm sập tiến trình thì không cho chạy lại mãi |
| `shopfast-scheduled` | Việc định kỳ: đồng bộ tồn kho mỗi 5 phút (Job Scheduler) | **Số lần thử:** 3<br>**Giãn cách:** cố định 30 s<br>**Song song:** 1<br>**Cảnh báo:** **không thành công quá 15 phút**, lỗi > 50% | `concurrency 1` để hai lần đồng bộ không chồng nhau. ERP bảo trì ngắn nên thử lại cố định. Cảnh báo theo **nhịp tim** (lần thành công gần nhất), nên job lỗi, job không được lên lịch hay worker chết đều bị phát hiện trong 15 phút thay vì 3 ngày |
| `shopfast-bulk` | Việc hàng loạt: cập nhật giá theo lô | **Số lần thử:** 3<br>**Giãn cách:** lũy thừa 5 s<br>**Song song:** 5<br>**Giới hạn tốc độ:** **20 lô/giây**<br>**Ưu tiên:** 10 (thấp)<br>**Cảnh báo:** chờ > 5.000, chờ > 30 phút, lỗi > 10% | Hãm khoảng 10.000 sản phẩm/giây để không đè CSDL. Chịu được chờ lâu nên ngưỡng backlog cao. Tỉ lệ lỗi > 10% cho thấy dữ liệu nguồn sai, nên báo sớm |

Mọi hàng đợi đều đặt `removeOnComplete` và `removeOnFail` có giới hạn, nên Redis không phình.

### Luồng dữ liệu và các cơ chế xuyên suốt

- **Bảng theo dõi** (`GET /api/dashboard`, trang `/` tự làm mới mỗi 3 giây). Với từng hàng đợi:
  - số job đang chờ, đang chạy, chờ thử lại, đã hoàn tất, thất bại;
  - số worker còn sống;
  - tỉ lệ lỗi trong cửa sổ trượt;
  - thời gian chờ của job cũ nhất;
  - cấu hình kèm lý do.

  Ngoài ra có nhịp tim của từng việc định kỳ và danh sách cảnh báo đang mở.
- **Cảnh báo** (`alert-rules.ts`, hàm thuần):

  | Loại | Điều kiện |
  |---|---|
  | `BACKLOG` | số job chờ vượt ngưỡng (gấp đôi ngưỡng thì mức `critical`) |
  | `SLOW_QUEUE` | job cũ nhất chờ quá lâu |
  | `FAILURE_RATE` | tỉ lệ lỗi vượt ngưỡng, chỉ xét khi đủ số mẫu |
  | `NO_WORKER` | còn job nhưng không có worker nào |
  | `STALE_SCHEDULE` | việc định kỳ quá lâu không chạy thành công |

  `AlertMonitor` chỉ báo khi cảnh báo **mới xuất hiện** (`firing`), **hết** (`resolved`) hoặc **vẫn còn** sau 30 phút (`reminder`), nên không spam.
- **Bất biến khi lặp:**
  - `jobId` lấy từ khóa nghiệp vụ (`otp:<otpId>`, `report:<reportId>`, `bulk-price:<batchId>`, `inventory-sync:<mốc lịch>`), nên thêm trùng không tạo job thứ hai;
  - `IdempotencyGuard` trong Redis (`done` → bỏ qua; `running` → tiến trình khác đang chạy, thử lại sau; lỗi → nhả khóa), nên job chạy lại vì thử lại, stalled hoặc thêm lại sau khi job cũ đã bị xóa cũng không chạy hai lần;
  - bản thân tác vụ được viết bất biến: gán giá trị tuyệt đối cho giá và tồn kho, ghi đè tệp báo cáo theo `reportId`, gửi SMS kèm khóa idempotency.
- **Xử lý ngoại lệ, không crash:**
  - dữ liệu hỏng hoặc tên tác vụ lạ → `UnrecoverableError` (thất bại ngay, không thử lại, ghi log);
  - lỗi tạm thời → thử lại theo backoff;
  - `error` của worker, queue và Redis → ghi log (ioredis tự nối lại);
  - vòng giám sát và notifier tự bắt lỗi (webhook hỏng không làm sập hệ thống);
  - cấp tiến trình: `unhandledRejection` → ghi log; `uncaughtException`/SIGTERM → tắt có trật tự.

## 3. Kịch bản demo (`npm run demo` → `logs/demo-run.log`)

Ngưỡng và lịch được rút ngắn để demo chạy trong khoảng 1 phút (lịch định kỳ 2 s, báo "không chạy" sau 6 s, cửa sổ lỗi 20 s, backlog bulk 100).

| Bước | Thao tác | Bảng điều khiển / cảnh báo quan sát được |
|---|---|---|
| 1 | Chạy bình thường: 30 OTP, 2 báo cáo, 20 lô giá | Mọi hàng đợi chờ 0, lỗi 0%, không có cảnh báo |
| 2 | Gửi lại OTP `otp-0` hai lần, thêm lại lô `b0` đã xong | `otp-0 duoc gui 1 lan`; số lần ghi giá vẫn là 1000 (20 lô × 50), không ghi lại |
| 3 | Dồn 400 lô giá (bulk chỉ xử lý 20 lô/giây) | `bulk` chờ 370 → **BACKLOG critical** |
| 4 | Nhà mạng SMS lỗi 70% | `critical` lỗi 56–69% → **FAILURE_RATE critical** |
| 5 | ERP sập | Đồng bộ thất bại liên tục → **STALE_SCHEDULE** sau 6 s, kèm FAILURE_RATE của `scheduled` và SLOW_QUEUE của `bulk` |
| 6 | Tắt worker hàng đợi `heavy`, vẫn có báo cáo mới | **NO_WORKER critical** |
| 7 | Đẩy job dữ liệu hỏng (`month: "thang-muoi"`, giá âm) và job lạ `xoa-toan-bo-du-lieu` | Thất bại ngay sau 1 lần, ghi log lỗi, hệ thống vẫn chạy |
| 8 | Khôi phục SMS và ERP, bật lại worker `heavy` | Lần lượt từng cảnh báo **tự resolved**, bảng về 0 cảnh báo |

Trích bảng điều khiển ở bước 5 và lịch sử cảnh báo:

```
hang doi  | cho  | chay | thu lai | xong | loi | worker | ti le loi | cho lau nhat
critical  |    0 |    0 |       0 |   71 |  19 |      1 |       69% | -
heavy     |    0 |    0 |       0 |    2 |   0 |      1 |        0% | -
scheduled |    0 |    0 |       1 |    7 |   4 |      1 |       62% | -
bulk      |  290 |    5 |       0 |  125 |   0 |      1 |        0% | 15.3s
dinh ky "inventory-sync": thanh cong gan nhat cach day 9.1s
canh bao dang mo:
  - [critical] Hang doi shopfast-bulk un tac: 290 job dang cho (nguong 100)
  - [critical] Ti le that bai shopfast-critical = 69% trong 20s gan nhat (90/131 lan chay, nguong 20%)
  - [critical] Viec dinh ky "inventory-sync" khong chay thanh cong 9s (lich 2s, nguong 6s)
  ...
=== Lich su canh bao ===
09:19:07 firing   BACKLOG        Hang doi shopfast-bulk un tac: 373 job dang cho (nguong 100)
09:19:12 firing   FAILURE_RATE   Ti le that bai shopfast-critical = 56% ...
09:19:20 firing   STALE_SCHEDULE Viec dinh ky "inventory-sync" khong chay thanh cong 6s ...
09:19:24 firing   NO_WORKER      Khong co worker nao dang xu ly shopfast-heavy trong khi con 3 job
09:19:26 resolved STALE_SCHEDULE ... -> da tro lai binh thuong
09:19:52 resolved BACKLOG        ... -> da tro lai binh thuong
```

## 4. Kiểm thử (`npm test`)

| Kiểm thử | Kết quả |
|---|---|
| Luật cảnh báo: bình thường không báo; backlog theo số job và theo thời gian chờ; tỉ lệ lỗi cần đủ mẫu; mất worker (trừ khi tạm dừng có chủ đích); việc định kỳ quá hạn | ✅ (4 kiểm thử) |
| `IdempotencyGuard`: cùng khóa chỉ chạy 1 lần, chạy đồng thời bị chặn, lỗi thì nhả khóa | ✅ |
| Hàng đợi `bulk` không có worker, 40 lô → BACKLOG và NO_WORKER bật; bật worker → cả hai tự resolved, 40 lô hoàn tất | ✅ |
| ERP sập → STALE_SCHEDULE; ERP sống lại → resolved, tồn kho được đồng bộ | ✅ |
| Thêm cùng OTP 3 lần → 1 job, 1 SMS; thêm lại sau khi job đã bị xóa → vẫn 1 SMS; dữ liệu hỏng/tác vụ lạ → thất bại sau 1 lần, không sập | ✅ |
| HTTP `/api/dashboard` trả số job của đủ 4 hàng đợi; trang `/` hiển thị | ✅ |

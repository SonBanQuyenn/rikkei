# Bài tập 8 – Chọn chiến lược triển khai cho giờ cao điểm

## A. Phân tích và đề xuất nhiều giải pháp

### A.1. Đầu vào / đầu ra

**Đầu vào**

| Thông số | Giá trị |
|---|---|
| Số container đang chạy (N) | 4, sau một load balancer |
| Thời gian khởi động + sẵn sàng của 1 container (T) | 25 giây |
| Ngân sách container trong lúc triển khai | tối đa 2 × 4 = **8** |
| Tải | 8.000 người dùng đang thao tác lúc 20h, có kết nối realtime (WebSocket) |
| Thay đổi DB | Có thay đổi cấu trúc; bản cũ và bản mới sẽ cùng chạy một thời gian |

**Đầu ra mong đợi**

1. Không có lúc nào toàn bộ hệ thống ngừng phục vụ.
2. Quay lui được trong < 2 phút nếu bản mới có lỗi.
3. Không bao giờ vượt 8 container.
4. Bản cũ và bản mới chạy được trên cùng một schema.
5. Người dùng realtime không bị mất kết nối đột ngột.

### A.2. Tính toán cho từng chiến lược

Ký hiệu: N = 4, T = 25 s, d = thời gian drain một container cũ (~5–10 s cho HTTP).

**(a) Recreate – dừng hết rồi khởi động bàn mới**
- Container tối đa: 4 (thêm 0).
- Thời gian hoàn tất: d + T ≈ 30 s.
- Gián đoạn: **≈ 25–30 s toàn hệ thống** (không có container nào sẵn sàng trong lúc khởi động).
- Quay lui: lặp lại recreate với bản cũ ≈ 30 s, **lại gián đoạn thêm 25–30 s**.

**(b) Rolling update – thay từng container (maxSurge = 1, maxUnavailable = 0)**
- Container tối đa: 5 (thêm 1).
- Thời gian hoàn tất: 4 đợt × (T + d) ≈ 4 × 30 s = **~120 s**.
- Gián đoạn: 0 (luôn có ≥ 4 container sẵn sàng).
- Quay lui: rolling ngược lại ≈ 120 s, cộng thời gian phát hiện → **sát hoặc vượt 2 phút**.
- Biến thể maxSurge = 2: 6 container, 2 đợt ≈ 60 s, quay lui ≈ 60 s.

**(c) Blue-green – dựng song song môi trường mới rồi chuyển luồng**
- Container tối đa: 4 (blue) + 4 (green) = **8** (thêm 4 = vừa đúng ngân sách gấp đôi).
- Thời gian hoàn tất: T (4 container khởi động song song) + smoke test ~10 s + chuyển luồng ~1 s ≈ **40 s**.
- Gián đoạn: 0.
- Quay lui khi blue còn chạy (cửa sổ quan sát): chỉ chuyển luồng lại ≈ **1–2 s**. Khi blue đã tắt: T + chuyển luồng ≈ 30 s.

**(d) Canary – phát hành dần cho một phần nhỏ người dùng**
- Container tối đa: 5 (thêm 1 canary ⇒ ~20% lưu lượng), sau đó thay dần 3 container còn lại.
- Thời gian hoàn tất: T + thời gian theo dõi canary (5–10 phút) + 3 × (T + d) ≈ **7–12 phút**.
- Gián đoạn: 0.
- Quay lui: bỏ canary ≈ vài giây (chỉ 20% người dùng bị ảnh hưởng); sau khi đã thay hết thì giống rolling ≈ 120 s.

---

## B. So sánh và lựa chọn

### B.1. Bảng so sánh

| Tiêu chí | (a) Recreate | (b) Rolling (surge 1) | (c) Blue-green | (d) Canary |
|---|---|---|---|---|
| Thời gian gián đoạn | ❌ 25–30 s toàn hệ thống | ✅ 0 | ✅ 0 | ✅ 0 |
| Số container cần thêm (tối đa) | 0 (4) | 1 (5) | 4 (**8**, đúng ngân sách) | 1 (5) |
| Thời gian triển khai | ~30 s | ~120 s | **~40 s** | 7–12 phút |
| Thời gian quay lui | ~30 s + gián đoạn lần 2 | ~120 s (vượt hoặc sát 2 phút) | ✅ **1–2 s** (blue còn chạy), ~30 s (đã tắt) | vài giây khi đang canary; ~120 s sau khi đã thay hết |
| Thời gian 2 phiên bản cùng chạy | 0 | ~2 phút | Cửa sổ quan sát (15 phút, kiểm soát được) | Lâu nhất (7–12 phút) |
| Độ phức tạp khi đổi cấu trúc DB | Thấp (không cùng chạy) nhưng vẫn gián đoạn | Trung bình – bắt buộc expand/contract | Trung bình – bắt buộc expand/contract | **Cao** – cùng chạy lâu, nhiều lần chuyển đổi |
| Kết nối realtime | ❌ Cắt tất cả cùng lúc | ⚠️ Một người có thể bị chuyển 2–4 lần (rơi lại vào container cũ chưa thay) | ✅ Chuyển đúng 1 lần, có điều phối | ⚠️ Cần sticky session, chuyển nhiều đợt |
| Độ phức tạp vận hành | Thấp | Thấp | Trung bình (2 môi trường + chuyển luồng) | Cao (chia luồng theo trọng số, theo dõi số liệu) |

### B.2. Lựa chọn: **Blue-green**

Đối chiếu 3 ràng buộc nghiệp vụ:

| Ràng buộc | Recreate | Rolling | Blue-green | Canary |
|---|---|---|---|---|
| 1. Không có lúc toàn hệ thống ngừng phục vụ | ❌ | ✅ | ✅ | ✅ |
| 2. Quay lui < 2 phút | ❌ (có gián đoạn) | ⚠️ ~120 s, không có biên an toàn | ✅ 1–2 s | ⚠️ chỉ nhanh khi còn ở giai đoạn canary |
| 3. Ngân sách ≤ 2× container | ✅ | ✅ | ✅ đúng 8/8 | ✅ |

Căn cứ:

- **Ngân sách gấp đôi** chính là điều kiện để blue-green khả thi: 4 container mới + 4 cũ = 8, không thừa không thiếu. Vì vừa khít ngân sách, kịch bản phải bảo đảm không bao giờ có container thứ 9: `deploy.sh` tắt hẳn môi trường idle còn sót của lần trước rồi mới kiểm tra `assert_budget 4` trước khi bật màu mới; `rollback.sh` cũng kiểm tra trước khi bật lại màu cũ.
- **Quay lui < 2 phút**: blue vẫn chạy nóng trong cửa sổ quan sát, quay lui chỉ là sửa 1 dòng upstream + `nginx -s reload`. Rolling chỉ đạt ~120 s, không còn biên cho thời gian phát hiện lỗi; canary chỉ nhanh trước khi thay hết.
- **Giờ cao điểm**: triển khai xong trong ~40 s (rolling ~2 phút, canary hơn 7 phút), nên thời gian 2 phiên bản cùng xử lý tải ngắn và mỗi người dùng realtime chỉ phải kết nối lại đúng một lần.
- Lý do chấp nhận độ phức tạp DB: rolling và canary cũng phải giải bài toán 2 phiên bản cùng chạy, nên phương pháp expand/contract bên dưới là bắt buộc với mọi chiến lược không gián đoạn.

---

## C. Thiết kế và triển khai

### C.1. Kiến trúc

```
                     ┌──────────────── nginx (shopfast-edge, không bao giờ dừng) ────────────────┐
  8.000 người dùng ─►│ upstream shopfast_api { server api-<blue|green>:3000; }  (active.conf)     │
  HTTP + WebSocket   └──────────────┬──────────────────────────────────────┬─────────────────────┘
                                    │ (active)                             │ (idle / dự phòng quay lui)
                     ┌──────────────▼──────────────┐        ┌──────────────▼──────────────┐
                     │ shopfast-blue  : 4 × api v1 │        │ shopfast-green : 4 × api v2 │
                     └──────────────┬──────────────┘        └──────────────┬──────────────┘
                                    └──────────────► PostgreSQL ◄──────────┘
                                         (schema expand: cả price và unit_price)
```

### C.2. Các bước thực hiện (`deploy/scripts/deploy.sh <tag>`)

| Bước | Việc làm | Container | Nếu thất bại |
|---|---|---|---|
| 0 | Lấy khoá, xác định màu active (blue) và idle (green) | 4 | Đang có thao tác khác → dừng |
| 1 | Màu idle còn container của lần trước → `down` (drain); `assert_budget 4` | 4 | Vượt ngân sách → dừng |
| 2 | **Migration EXPAND** (`migrate.sh`, mỗi file 1 transaction) | 4 | ROLLBACK schema, blue không bị ảnh hưởng, dừng |
| 3 | `up -d --wait` 4 container green, chờ cả 4 healthy (~25 s) | 8 | `down` green, blue vẫn phục vụ |
| 4 | Smoke test trực tiếp `http://api-green:3000/health` | 8 | `down` green |
| 5 | Ghi `active.conf` → `nginx -t` → `nginx -s reload` (graceful) | 8 | Cấu hình sai → khôi phục file cũ, không reload |
| 6 | Kiểm tra qua nginx 30 s: `/health` phải trả version mới | 8 | **Tự động quay lui** (`rollback.sh`) |
| 7 | Giữ blue chạy 15 phút (cửa sổ quan sát) | 8 | Có lỗi → `rollback.sh` (1–2 s) |
| 8 | `finalize.sh`: drain + tắt blue | 4 | – |
| 9 | Lần triển khai **sau**: `migrate.sh --with-contract` | 4 | – |

### C.3. Xử lý thay đổi cấu trúc DB khi hai phiên bản cùng chạy (bẫy 1)

Ví dụ thay đổi của v2: đổi tên `products.price` → `products.unit_price`. Nếu đổi tên trực tiếp, v1 (blue, đang phục vụ 8.000 người) sẽ lỗi ngay. Giải pháp **expand → migrate → contract**:

| Giai đoạn | Lúc chạy | Nội dung (`migrations/`) | v1 | v2 |
|---|---|---|---|---|
| **Expand** | Bước 2, trước khi bật green | `002_expand_unit_price.sql`: thêm cột `unit_price`, backfill, trigger đồng bộ 2 chiều `price ↔ unit_price`, bỏ `NOT NULL` ở `price` | ✅ vẫn đọc/ghi `price` | ✅ đọc/ghi `unit_price` |
| Cùng chạy | Bước 3 → 8 | Trigger giữ 2 cột luôn bằng nhau, ai ghi cột nào cũng được | ✅ | ✅ |
| **Contract** | Lần triển khai **sau**, khi đã không còn v1 và hết cửa sổ quay lui | `003_contract_unit_price.sql`: bỏ trigger, `unit_price NOT NULL`, xoá `price` | ❌ (đã tắt) | ✅ |

Hệ quả quan trọng: **quay lui về v1 không cần migration ngược**, vì schema sau expand vẫn tương thích với v1. `migrate.sh` bỏ qua mọi file `*_contract_*` nếu không có cờ `--with-contract`, nên không thể vô tình chạy contract lúc v1 còn sống. Mỗi file chạy với `psql --single-transaction -v ON_ERROR_STOP=1`: lỗi giữa chừng → ROLLBACK, không để schema nửa vời.

### C.4. Không làm mất kết nối realtime (bẫy 2)

1. **Lúc chuyển luồng** – `nginx -s reload` là graceful: worker mới nhận kết nối mới (vào green), worker cũ **giữ nguyên** các WebSocket đang mở tới blue. `worker_shutdown_timeout 20m` (> cửa sổ 15 phút + drain) để nginx không tự cắt chúng.
2. **Lúc tắt màu cũ** (`finalize.sh` hoặc `rollback.sh`) – `docker compose down --timeout 60` gửi SIGTERM, ứng dụng (`src/main.ts`):
   - `/health` trả 503, nginx có `proxy_next_upstream http_503` nên request HTTP không bị lỗi;
   - gửi `{"type":"reconnect","retryAfterMs": 0–10000}` tới từng client – thời gian ngẫu nhiên để 8.000 kết nối không dồn vào green cùng một lúc;
   - chờ client tự rời đi tối đa 45 s (`DRAIN_TIMEOUT_MS`), `stop_grace_period: 60s` > 45 s nên Docker không kill sớm.
3. **Phía client** (`public/realtime-client.js`): nhận `reconnect` → mở kết nối mới trước, đóng kết nối cũ sau 1 s (make-before-break); nếu mất kết nối bất ngờ thì kết nối lại theo exponential backoff + jitter.
4. `rollback.sh` chờ 10 s sau khi chuyển luồng rồi mới tắt màu lỗi, để worker nginx cũ xử lý xong các request HTTP đang dở.

### C.5. Cấu hình

```
ex4/
├── Dockerfile
├── src/main.ts                     # /health (readiness), drain WebSocket khi SIGTERM
├── public/realtime-client.js       # client tự kết nối lại
├── migrations/
│   ├── 001_init_v1.sql             # schema hiện tại
│   ├── 002_expand_unit_price.sql   # EXPAND – chạy trong lần triển khai này
│   └── 003_contract_unit_price.sql # CONTRACT – lần triển khai sau
├── deploy/
│   ├── docker-compose.edge.yml     # nginx
│   ├── docker-compose.app.yml      # 1 màu = 4 replica, alias api-<màu>
│   ├── nginx/nginx.conf, nginx/upstream/active.conf
│   ├── .env.example
│   └── scripts/ lib.sh, migrate.sh, deploy.sh, rollback.sh, finalize.sh
└── logs/                           # kết quả chạy thử thật
```

Cài đặt lần đầu trên server:

```bash
docker network create shopfast
cp deploy/.env.example deploy/.env && chmod 600 deploy/.env    # điền DATABASE_URL
COLOR=blue IMAGE_TAG=<sha-hiện-tại> docker compose -p shopfast-blue -f deploy/docker-compose.app.yml up -d --wait
mkdir -p deploy/state && echo blue > deploy/state/active_color && echo <sha-hiện-tại> > deploy/state/active_tag
docker compose -p shopfast-edge -f deploy/docker-compose.edge.yml up -d
```

Triển khai lúc 20h:

```bash
deploy/scripts/deploy.sh <sha-mới>     # ~40 s, 0 gián đoạn
# theo dõi 15 phút; có lỗi:
deploy/scripts/rollback.sh             # 1–2 s
# ổn định:
deploy/scripts/finalize.sh             # drain + tắt màu cũ
```

### C.6. Kết quả chạy thử thật (Docker Desktop, máy cục bộ)

Trong lúc chạy kịch bản, một tiến trình gửi request `GET /products/1` qua nginx mỗi 50 ms và giữ 1 kết nối WebSocket (logic giống `realtime-client.js`). Ở máy thử, image nhỏ nên container sẵn sàng sau ~7 s thay vì 25 s.

| Kịch bản | Kết quả | Log |
|---|---|---|
| Deploy v1 → v2 (blue → green) + finalize | Expand migration OK, contract bị bỏ qua; 4 container green healthy sau 7 s, **tổng 8 container**; chuyển luồng; tổng 47 s (gồm 30 s kiểm tra sau chuyển). **1.951 request, 0 lỗi**; WebSocket nhận `reconnect`, nối lại sang v2, **0 lần mất kết nối bất ngờ** | `logs/deploy-v2.log`, `logs/finalize.log`, `logs/traffic-during-deploy-finalize.log` |
| Quay lui khi màu cũ đã tắt (bật lại 4 container rồi chuyển) | Quay lui xong sau **8 s** | `logs/rollback-cold.log` |
| Quay lui khi màu cũ còn chạy | Quay lui xong sau **1 s** | `logs/rollback-hot.log` |
| Tải trong suốt các lần quay lui + deploy lại | **2.206 request, 0 lỗi**, WebSocket chuyển 1 lần, 0 lần mất kết nối bất ngờ | `logs/traffic-during-rollback.log` |

Ghi chú: lần thử đầu, `rollback.sh` tắt màu lỗi ngay sau khi reload nginx và có 2/2.597 request lỗi `fetch failed`. Đã thêm bước chờ 10 s trước khi tắt (mục C.4.4); lần đo lại không còn lỗi.

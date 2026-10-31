# Quy trình quay lui (Rollback) – ShopFast API

Mục tiêu: đưa staging hoặc production về một phiên bản cũ trong **dưới 3 phút**.

## 1. Cơ chế nền tảng

- Mọi image đều có thẻ = mã commit (`ghcr.io/shopfast/api:<sha>`), bất biến, không bị ghi đè.
- Server lưu `/opt/shopfast/.current_tag` (đang chạy) và `.previous_tag` (bản liền trước).
- Migration theo kiểu expand/contract → phiên bản cũ chạy được trên schema mới, quay lui **không** cần chạy migration ngược.

## 2. Quay lui tự động (không cần người)

`deploy.sh` kiểm tra `GET /health` tối đa 60 giây sau khi đổi container. Nếu không đạt (health trả về khác 200 – DB hoặc Redis không kết nối được, hoặc ứng dụng không khởi động) → tự `docker compose up` lại tag trong `.current_tag` và báo job đỏ.

Migration lỗi → không đổi container nào, phiên bản cũ vẫn chạy.

## 3. Quay lui thủ công

Dùng khi bản mới đã qua health check nhưng phát hiện lỗi nghiệp vụ sau đó.

### Bước 1 – Xác định tag cần quay về (≈ 20 giây)

Một trong các cách:

```bash
# Bản liền trước trên server
ssh deploy@<host> cat /opt/shopfast/.previous_tag

# Hoặc lấy từ lịch sử triển khai
gh run list --workflow "Deploy production" --status success --limit 5
```

### Bước 2 – Chạy workflow Rollback (≈ 10 giây thao tác)

GitHub → **Actions → Rollback → Run workflow**, chọn:
- `environment`: `production` (hoặc `staging`)
- `image_tag`: mã commit ở bước 1

Hoặc bằng dòng lệnh:

```bash
gh workflow run rollback.yml -f environment=production -f image_tag=<sha>
```

### Bước 3 – Pipeline tự chạy (≈ 1–1,5 phút)

| Job | Việc làm | Thời gian ước tính |
|---|---|---|
| `verify-image` | `docker manifest inspect` – bảo đảm tag tồn tại, tránh gõ nhầm | ~15 s |
| `rollback` (`_deploy.yml`) | SSH, `docker compose pull` (image cũ thường còn trong cache của server), `up -d`, health check | ~30–60 s |

Không có build, test hay migration. Environment `production-rollback` không yêu cầu phê duyệt nên không có thời gian chờ người. Workflow dùng chung concurrency group `deploy-production` nên không thể chạy chồng lên một lần deploy khác.

### Bước 4 – Xác nhận (≈ 10 giây)

```bash
curl -s https://api.shopfast.vn/health
# {"status":"ok","version":"<sha cũ>"}
```

**Tổng: khoảng 2 phút < 3 phút.**

## 4. Khi nào cần khôi phục dữ liệu

Chỉ khi một migration đã làm hỏng dữ liệu (rất hiếm vì migration lỗi đã được `ROLLBACK`):

```bash
ssh deploy@<prod-host>
ls /opt/shopfast/backups/                 # before-<sha>-<thời gian>.dump
docker run --rm -i --env-file /opt/shopfast/.env postgres:16-alpine \
  sh -c 'pg_restore --clean --if-exists -d "$DATABASE_URL"' < backups/before-<sha>-<time>.dump
```

Việc này cần tech lead quyết định vì sẽ mất dữ liệu ghi sau thời điểm sao lưu.

## 5. Sau khi quay lui

1. Revert commit lỗi trên `main` (và `develop`) bằng PR – để lần merge tiếp theo không đưa lỗi trở lại.
2. Ghi lại sự cố: tag lỗi, tag quay về, thời gian phát hiện, thời gian khôi phục.

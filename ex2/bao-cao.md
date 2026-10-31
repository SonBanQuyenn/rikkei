# Bài tập 6 – Điền khuyết pipeline CI/CD bị thiếu bước bảo vệ

Tệp cấu hình đã hoàn thiện: `.github/workflows/ci-cd.yml`
(thư mục `ex2` đóng vai trò thư mục gốc của repo ShopFast API).

## 5 chỗ khuyết đã điền

| # | Chỗ khuyết | Đã điền | Tác dụng |
|---|---|---|---|
| 1 | Bộ nhớ đệm phụ thuộc | `actions/setup-node@v4` với `cache: npm` + `npm ci` | Cache `~/.npm` theo hash của `package-lock.json`; lần sau không tải lại phụ thuộc từ đầu (hết 8 phút cài lại) |
| 2 | Kiểm thử trước khi đóng gói | Bước `npm test` (unit) và `npm run test:integration` đứng **trước** `docker build` | Một bước thất bại thì job dừng ngay → mã chưa qua kiểm thử không bao giờ được đóng gói |
| 3 | Khoá bí mật trong tệp | Xoá `-p MatKhauCuaToi123`, dùng `secrets.GHCR_USERNAME`, `secrets.GHCR_TOKEN` + `--password-stdin` | Mật khẩu không còn trong mã nguồn, không hiện trong log (GitHub tự che `***`) |
| 4 | Chỉ chạy ở nhánh chính | `if: github.ref == 'refs/heads/main'` cho bước đăng nhập và đẩy image | Nhánh phụ vẫn build + test nhưng **không** đẩy image → không lặp lại sự cố nhánh làm dở bị triển khai |
| 5 | Thẻ theo mã commit | `-t $IMAGE:${{ github.sha }}` bên cạnh `latest`, đẩy cả hai | Mỗi bản build có thẻ cố định, quay lui bằng cách triển khai lại `ghcr.io/shopfast/api:<sha-cũ>` |

## Bẫy dữ liệu

- **Kiểm thử tích hợp cần Postgres và Redis**: pipeline khai báo `services.postgres` (postgres:16-alpine) và `services.redis` (redis:7-alpine), có `--health-cmd` để job chờ dịch vụ sẵn sàng rồi mới chạy test. Test kết nối qua `DATABASE_URL`, `REDIS_URL` trỏ về `localhost`.
- **Chỉ có thẻ `latest` thì không quay lui được**: mỗi image luôn được gắn thêm thẻ `github.sha` (bất biến). `latest` chỉ để tiện, không dùng để triển khai.

## Thiết lập bí mật trên GitHub

`Settings → Secrets and variables → Actions → New repository secret`:

| Tên | Giá trị |
|---|---|
| `GHCR_USERNAME` | Tài khoản có quyền ghi vào `ghcr.io/shopfast` |
| `GHCR_TOKEN` | Personal access token có quyền `write:packages` |

Mật khẩu cũ `MatKhauCuaToi123` đã từng nằm trong lịch sử git nên phải **thu hồi và đổi**.

## Kiểm tra cục bộ trước khi đẩy

Đã chạy thử với Postgres và Redis thật trong Docker:

```
$ npm test
Tests:       3 passed, 3 total

$ DATABASE_URL=postgres://shopfast:shopfast@localhost:55432/shopfast_test \
  REDIS_URL=redis://localhost:56379 npm run test:integration
  √ doc san pham tu Postgres va ghi vao Redis
  √ lan doc sau lay tu Redis du du lieu DB da doi
  √ tra ve null khi khong co san pham
Tests:       3 passed, 3 total
```

## Ảnh chụp hai lần chạy

Đặt ảnh vào thư mục `screenshots/`:

| Lần chạy | Kết quả mong đợi | Ảnh |
|---|---|---|
| Push lên nhánh phụ (ví dụ `feature/cart`) | Unit test, integration test, docker build xanh; **Login ghcr.io** và **Push image** hiển thị *skipped* | `screenshots/run-feature-branch.png` |
| Push / merge vào `main` | Tất cả bước xanh, image được đẩy với 2 thẻ `<sha>` và `latest` | `screenshots/run-main-branch.png` |

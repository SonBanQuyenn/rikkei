# Bài tập 5 – Vá lỗi hàng rào giới hạn bị bot vượt qua dễ dàng

## Phần 1 – Chỉ ra lỗi bằng dữ liệu

Mã nguồn lỗi được giữ nguyên trong `src/buggy/`, bản đã sửa trong `src/fixed/`. Kịch bản kiểm thử nằm ở `test/throttle.test.ts` (chạy `npm test`).

### Luồng thực thi hiện tại

`ThrottlerModule.forRoot(...)` chỉ **đăng ký cấu hình và bộ lưu trữ đếm**. Việc chặn do `ThrottlerGuard` thực hiện, mà guard này chưa được gắn ở đâu cả (không có `APP_GUARD`, không có `@UseGuards`). Vì vậy mọi request đi thẳng vào controller, không ai đọc cấu hình `limit: 3`.

### Khiếm khuyết K1 – Bộ bảo vệ chưa bao giờ được kích hoạt

| | |
|---|---|
| Nguyên nhân | `ThrottlerGuard` không được đăng ký toàn cục (`APP_GUARD`) nên `forRoot({ ttl: 60000, limit: 3 })` không có tác dụng |
| Kịch bản kiểm thử | Cùng tài khoản `acc-1` gọi `POST /orders/flash-sale` **10 lần liên tiếp** (trong < 1 giây) |
| Kết quả thực tế | 10 × `201 Created` – không lần nào bị chặn (đúng với hiện trường: 180 đơn/phút) |
| Kết quả đúng | 3 × `201`, 7 lần còn lại `429 Too Many Requests` |

### Khiếm khuyết K2 – `@SkipThrottle()` vô hiệu hoá hàng rào ở endpoint tốn tiền nhất

| | |
|---|---|
| Nguyên nhân | `@SkipThrottle()` đặt trên `sendOtp` khiến guard bỏ qua endpoint này. Kể cả khi đã sửa K1, OTP vẫn không bị giới hạn. Ngoài ra không có cấu hình riêng 3 lần / 5 phút cho OTP |
| Kịch bản kiểm thử | Cùng tài khoản gọi `POST /auth/send-otp` **10 lần liên tiếp** |
| Kết quả thực tế | 10 × `201` – 10 tin SMS bị gửi đi (nguyên nhân hoá đơn SMS tăng 12 lần) |
| Kết quả đúng | 3 × `201`, 7 lần còn lại `429` cho tới hết cửa sổ 5 phút |

Kết quả chạy:

```
▶ Ban LOI - chung minh khiem khuyet
  ✔ K1: guard chua kich hoat - 1 tai khoan dat 10 don flash sale lien tiep deu thanh cong
  ✔ K2: @SkipThrottle tren send-otp - 10 tin OTP lien tiep deu duoc gui
▶ Ban DA SUA
  ✔ K1: tai khoan chi dat duoc 3 don flash sale / 60s, lan thu 4 tro di bi 429
  ✔ K2: send-otp chi goi duoc 3 lan / 5 phut
  ✔ han muc dem theo tai khoan: tai khoan khac cung IP khong bi anh huong
  ✔ phan hoi 429 co Retry-After de client biet khi nao thu lai
```

## Phần 2 – Source code đã sửa

```ts
// fixed/app.module.ts
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 3 }])],
  controllers: [OrderController, AuthController],
  providers: [{ provide: APP_GUARD, useClass: AccountThrottlerGuard }], // sửa K1
})
export class AppModule {}

// fixed/order.controller.ts
@Throttle({ default: { limit: 3, ttl: 60_000 } })
@Post('flash-sale')
createFlashSaleOrder(@Body() dto: CreateOrderDto) { ... }

// fixed/auth.controller.ts – bỏ @SkipThrottle(), sửa K2
@Throttle({ default: { limit: 3, ttl: 5 * 60_000 } })
@Post('send-otp')
sendOtp(@Body() dto: SendOtpDto) { ... }
```

Quy tắc nghiệp vụ tính theo **tài khoản**, trong khi `ThrottlerGuard` mặc định đếm theo IP. `AccountThrottlerGuard` (`fixed/account-throttler.guard.ts`) ghi đè `getTracker` để đếm theo id tài khoản (header `x-user-id`, ở hệ thống thật lấy từ token đã xác thực). Request chưa đăng nhập thì đếm theo IP.

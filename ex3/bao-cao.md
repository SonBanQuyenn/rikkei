# Bài tập 7 – Dây chuyền xử lý đơn hàng nhiều bước

Chạy thử: `npm start` (cần Redis tại `REDIS_URL`) → kết quả trong `logs/demo-run.log`. Kiểm thử: `npm test`, 11 kịch bản.

```
src/
  config/pipeline.config.ts      tên hàng đợi, số lần thử và backoff của từng bước, cấu hình worker
  domain/order.ts                trạng thái đơn, lỗi nghiệp vụ vĩnh viễn
  domain/order.repository.ts     "CSDL" đơn hàng (Redis): trạng thái, các bước đã xong, lịch sử
  integrations/contracts.ts      hợp đồng với kho, cổng thanh toán, HĐĐT, thông báo, vận chuyển, kế toán
  integrations/fakes.ts          bản giả lập để demo/kiểm thử, cài lỗi được
  pipeline/step.ts               giao diện một bước: run() + onFinalFailure()
  pipeline/steps/*.step.ts       logic 5 bước
  pipeline/order-pipeline.ts     điều phối: hàng đợi, worker, nối bước, khôi phục khi khởi động
```

## A. Báo cáo phân tích và thiết kế giải pháp

### 1. Phân tích bài toán (I/O)

| Bước | Dữ liệu vào | Kết quả ra | Thành công thì | Thất bại thì |
|---|---|---|---|---|
| 1. Giữ hàng trong kho | `orderId`, `items` | `reservationId` | Trạng thái `STOCK_RESERVED` → bước 2 | Hết hàng (lỗi vĩnh viễn, không thử lại), hoặc kho lỗi 3 lần → **hủy đơn + hoàn tiền**, trạng thái `CANCELLED (OUT_OF_STOCK)`, các bước sau không chạy |
| 2. Xác nhận thanh toán | `orderId`, `amount`, khóa `pay-<orderId>` | `transactionId` | `PAID` → bước 3 | Cổng từ chối, hoặc lỗi/timeout 4 lần (đã tra cứu lại mà chưa bị trừ tiền) → **trả hàng về kho + hủy đơn**, `CANCELLED (PAYMENT_FAILED)` |
| 3. Xuất hóa đơn điện tử | `orderId`, `amount` | số hóa đơn | `INVOICED` → bước 4 | Thử tối đa 5 lần; vẫn hỏng → **tạo việc cho kế toán**, `INVOICE_MANUAL`, **đơn vẫn đi tiếp** bước 4 |
| 4. Gửi email + SMS | email, số điện thoại, `orderId` | trạng thái từng kênh | `READY_TO_SHIP` → bước 5 | Thử 3 lần; vẫn hỏng → ghi `notification.sms/email = FAILED`, vẫn `READY_TO_SHIP` → bước 5 (**không ảnh hưởng đơn**) |
| 5. Đẩy sang đối tác vận chuyển | `reference = orderId`, `items` | mã vận đơn | `SHIPPED` (kết thúc) | Thử 6 lần; vẫn hỏng → `SHIPPING_FAILED` + tạo việc cho vận hành |

Sau mỗi bước, trạng thái và một dòng lịch sử (thời điểm, trạng thái, ghi chú) được ghi vào đơn. Khách tra cứu đơn là thấy đơn đang ở đâu và vì sao.

### 2. Ý tưởng giải pháp

- **Số hàng đợi:** 5, mỗi bước một hàng đợi (`order-reserve-stock`, `order-confirm-payment`, `order-issue-invoice`, `order-notify-customer`, `order-push-shipping`). Mỗi bước có số lần thử, backoff và mức song song riêng. Bước nào ùn hay lỗi thì nhìn hàng đợi đó là thấy, và một bước lỗi không chặn bước của đơn khác.
- **Cách nối các bước:** worker của bước N làm xong thì (a) ghi kết quả và trạng thái mới vào đơn, (b) thêm job bước N+1 với `jobId = <orderId>-<bước>`. Mỗi đơn chỉ có một job cho mỗi bước, nên thêm lặp không tạo trùng. Trạng thái kết thúc (`CANCELLED`, `SHIPPED`, `SHIPPING_FAILED`) thì dừng. Bước kế luôn là `STEPS[số bước đã xong]`, vì mọi nhánh thất bại hoặc kết thúc đơn, hoặc đi tiếp sang bước kế.
- **Trạng thái đơn được cập nhật ở đâu:** trong bản ghi đơn (CSDL), qua `OrderRepository.completeStep()`, do `order-pipeline.ts` gọi sau mỗi bước, kể cả khi bước đó thất bại. Trường `completedSteps` là nguồn sự thật để biết đơn đang dừng ở bước nào.
- **Xử lý thất bại:** mỗi bước có `run()` (ném lỗi thì được thử lại) và `onFinalFailure()` (nhánh rẽ). `onFinalFailure()` chạy khi gặp `PermanentError` (hết hàng, thẻ bị từ chối; thử lại cũng vô ích) hoặc ở lần thử cuối cùng.

### 3. Luồng toàn bộ dây chuyền

```
Khách đặt hàng ─► [PLACED] ─► (1) Giữ hàng
                                 ├─ hết hàng / kho lỗi 3 lần ─► hoàn tiền ─► [CANCELLED: OUT_OF_STOCK]  ■
                                 └─ ok ─► [STOCK_RESERVED] ─► (2) Xác nhận thanh toán
                                             │  mỗi lần thử: tra cứu cổng theo pay-<orderId>
                                             │    đã captured ─► dùng kết quả cũ (không trừ lại)
                                             │    chưa có     ─► capture(idempotencyKey) có timeout
                                             ├─ từ chối / hết 4 lần mà vẫn chưa captured
                                             │        ─► trả hàng về kho ─► [CANCELLED: PAYMENT_FAILED]  ■
                                             └─ ok ─► [PAID] ─► (3) Xuất hóa đơn điện tử (≤ 5 lần)
                                                         ├─ ok ─► [INVOICED] ──────────────┐
                                                         └─ hỏng 5 lần ─► việc kế toán ─► [INVOICE_MANUAL]
                                                                                           ▼
                                                     (4) Gửi email + SMS (≤ 3 lần, kênh đã gửi thì không gửi lại)
                                                         ├─ ok          ─► [READY_TO_SHIP]
                                                         └─ hỏng 3 lần  ─► ghi FAILED ─► [READY_TO_SHIP]
                                                                                           ▼
                                                     (5) Đẩy sang vận chuyển (≤ 6 lần, reference = orderId)
                                                         ├─ ok          ─► [SHIPPED]  ■
                                                         └─ hỏng 6 lần  ─► việc vận hành ─► [SHIPPING_FAILED]  ■
```

## B. Triển khai và chống lỗi

Logic trong mã khớp với thiết kế ở phần A: mỗi dòng trong bảng I/O tương ứng với một tệp `pipeline/steps/*.step.ts`. Mỗi tệp có `run()` cho nhánh thành công và `onFinalFailure()` cho nhánh thất bại.

### Bẫy 1 – Cổng thanh toán hết thời gian chờ nhưng tiền đã bị trừ: không được trừ lần hai

`pipeline/steps/confirm-payment.step.ts`:

```ts
async run(order, { deps, paymentTimeoutMs }) {
  const key = paymentKey(order.id);                       // 1 đơn = 1 khóa, dùng cho mọi lần thử và mọi tiến trình
  const previous = await deps.payment.getPayment(key);    // (1) tra cứu TRƯỚC khi trừ
  if (previous?.status === 'captured') return paid(previous, '... khong tru lai');
  if (previous?.status === 'declined') throw new PaymentDeclinedError(...);

  const rec = await withTimeout(                          // (2) trừ kèm idempotencyKey, có timeout
    deps.payment.capture({ orderId: order.id, amount: order.amount, idempotencyKey: key }),
    paymentTimeoutMs, 'Cong thanh toan');                 // (3) timeout → lỗi tạm thời, lần sau quay lại (1)
  ...
},
async onFinalFailure(order, error, { deps }) {
  const last = await deps.payment.getPayment(paymentKey(order.id)); // (4) không bao giờ hủy đơn đã bị trừ tiền
  if (last?.status === 'captured') return paid(last, ...);
  await deps.inventory.release(order.id); ...
}
```

Có hai lớp bảo vệ. Lớp 1: tra cứu trước khi trừ, không phụ thuộc vào việc cổng có hỗ trợ idempotency hay không. Lớp 2: gửi `idempotencyKey`, chặn cả trường hợp hai tiến trình cùng chạy job này. Kiểm thử chạy với cả cổng **có** và **không** hỗ trợ idempotency. Cả hai đều cho `charges = 1`, `captureCalls = 1`: lần thử thứ hai tra cứu thấy đã trừ nên không gọi lệnh trừ nữa.

### Bẫy 2 – Toàn bộ tiến trình khởi động lại giữa dây chuyền: phải tiếp tục từ bước đang dở

`pipeline/order-pipeline.ts`:

```ts
private async handle(step, job) {
  const order = await this.repo.get(job.data.orderId);
  if (TERMINAL_STATUSES.includes(order.status)) return { skipped: 'order-finished' };
  if (order.completedSteps.includes(step.name)) {         // bước đã ghi xong, chỉ chết trước khi báo hoàn tất
    await this.enqueueNext(order);                         // → chỉ nối bước kế, không làm lại
    return { skipped: 'step-already-done' };
  }
  ... run() / onFinalFailure() → repo.completeStep(...) → enqueueNext(...)
}

async recover() {                                          // gọi khi khởi động
  for (const order of await this.repo.listInProgress()) await this.enqueueNext(order);
}
```

| Thời điểm tiến trình chết | Điều gì cứu đơn |
|---|---|
| Giữa hai bước | Job bước kế đã nằm trong Redis; tiến trình mới chạy tiếp từ đó |
| Đang chạy bước N | Khóa job hết hạn (`lockDuration` 30 s) → job bị coi là bỏ rơi → chạy lại **chỉ bước N**. Các bước đều idempotent: giữ hàng theo `orderId`, thanh toán theo khóa, hóa đơn theo `orderId`, thông báo ghi từng kênh đã gửi, vận chuyển theo `reference` |
| Sau khi ghi CSDL bước N nhưng trước khi tạo job N+1 | Chạy lại job N thì thấy `completedSteps` đã có N nên chỉ tạo job N+1. Nếu job N cũng mất thì `recover()` lúc khởi động đọc `completedSteps` và tạo đúng job N+1 |

Không bước nào đã xong bị chạy lại, vì mỗi bước một job, và bước đã nằm trong `completedSteps` thì bị bỏ qua.

### Kết quả chạy thử (`logs/demo-run.log`, trích)

```
>>> Tien trinh #1 bi dung dot ngot. Don 172a6130 dang o trang thai STOCK_RESERVED, buoc xong: [reserve-stock]
>>> Tien trinh #2 khoi dong, recover() noi tiep 5 don chua ket thuc
### Tien trinh khoi dong lai giua buoc 2
  PLACED → STOCK_RESERVED → PAID "Thanh toan da duoc tru o lan thu truoc (tx-5) - khong tru lai" → INVOICED → READY_TO_SHIP → SHIPPED
### He thong ben ngoai
  So lan tru tien that: 5 (moi don thanh toan thanh cong dung 1 lan)
```

### Kiểm thử (`npm test`)

| Kịch bản | Kết quả kiểm tra |
|---|---|
| Thành công | đi đủ 6 trạng thái, mỗi hệ thống bên ngoài được gọi đúng 1 lần |
| Hết hàng | `CANCELLED`, hoàn tiền 1 lần, không gọi thanh toán, không chạy bước sau |
| Cổng từ chối / cổng lỗi hết 4 lần | `CANCELLED`, hàng trả về kho (tồn kho về 10), không trừ tiền |
| Trừ tiền xong nhưng timeout (cổng có / không hỗ trợ idempotency) | `SHIPPED`, chỉ trừ tiền 1 lần |
| Hóa đơn điện tử hỏng | gọi đúng 5 lần, tạo việc kế toán, đơn vẫn `SHIPPED` |
| SMS hỏng | đơn `SHIPPED`, email chỉ gửi 1 lần dù bước được thử 3 lần |
| Vận chuyển hỏng | `SHIPPING_FAILED`, tạo việc cho vận hành |
| Tiến trình chết giữa bước 2, tiến trình mới khởi động | tiếp tục từ bước 2, `reserveCalls = 1`, trừ tiền 1 lần |
| Chết sau khi ghi CSDL nhưng trước khi tạo job kế | `recover()` nối tiếp, đơn `SHIPPED` |

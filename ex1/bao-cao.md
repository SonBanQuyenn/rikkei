# Bài tập 5 – Vá lỗi khách hàng nhận 5 email xác nhận cho một đơn

Mã gốc: `src/email/email.processor.buggy.ts`, `src/order/order.service.buggy.ts`
Bản đã sửa: `src/email/email.processor.ts`, `src/email/email-queue.options.ts`, `src/email/email-idempotency.store.ts`, `src/order/order.service.ts`
Kiểm thử: `test/email.defects.test.ts` (`npm test`, cần Redis tại `REDIS_URL`, mặc định `redis://127.0.0.1:6379`). Mỗi kịch bản chạy trên cả bản gốc lẫn bản sửa với BullMQ + Redis thật. Kết quả lần chạy: `logs/test-run.log`.

Nhà cung cấp email trong kiểm thử (`FakeMailProvider`) hoạt động như nhà cung cấp thật: đếm số thư thực sự tới hộp thư khách, và nếu request có `Idempotency-Key` đã gặp thì trả lại `messageId` cũ, không gửi thêm.

## Phần 1 – Chỉ ra lỗi bằng dữ liệu

### Khiếm khuyết 1 – Thư đã đi nhưng phản hồi bị timeout → mỗi lần thử lại gửi thêm một thư

`process` coi mọi lỗi của `sendConfirmation` là "chưa gửi". Khi nhà cung cấp đã nhận thư nhưng phản hồi về chậm (timeout), job ném lỗi, BullMQ thử lại (`attempts: 5`), và mỗi lần thử gửi thêm một thư. Không có gì ghi nhớ đơn này đã gửi rồi.

| Làm gì | Quan sát gì |
|---|---|
| Tạo 1 đơn. Nhà cung cấp nhận thư ở cả 5 lần gọi, nhưng 4 lần đầu phản hồi bị timeout | Số thư khách nhận cho đơn đó |

| | Số lần gọi nhà cung cấp | Số thư khách nhận |
|---|---|---|
| Kết quả đúng | – | **1** |
| Thực tế (bản gốc) | 5 | **5** ❌ |
| Bản sửa | 5 | 1 ✅ |

Đây đúng là sự cố "khách nhận 5 email giống hệt nhau cho một đơn": số thư trùng bằng `attempts`.

### Khiếm khuyết 2 – Tiến trình chết ngay sau khi gửi → job bị chạy lại từ đầu

Khi worker chết (deploy, OOM) sau lúc gửi thư nhưng trước lúc báo hoàn tất, khóa của job hết hạn. BullMQ coi job là *stalled* và giao cho worker khác chạy lại `process` từ đầu, nên thư bị gửi lần hai.

| Làm gì | Quan sát gì |
|---|---|
| Worker A gửi thư xong thì bị tắt cưỡng bức (`close(true)`), không kịp báo xong. Khởi động worker B | Số thư khách nhận |

| | Số lần gọi nhà cung cấp | Số thư khách nhận |
|---|---|---|
| Kết quả đúng | – | **1** |
| Thực tế (bản gốc) | 2 | **2** ❌ |
| Bản sửa | 2 | 1 ✅ (lần 2 gửi cùng khóa idempotency, nhà cung cấp trả lại thư cũ) |

### Khiếm khuyết 3 – Không có thời gian chờ giữa các lần thử → mất email khi nhà cung cấp gián đoạn ngắn

`attempts: 5` không đi kèm `backoff`, nên 5 lần thử chạy liền nhau, cách nhau vài ms. Một sự cố ngắn cỡ 1–2 giây cũng đủ đốt hết 5 lần thử. Job thất bại, khách không nhận được thư nào, và nhà cung cấp còn bị dội 5 request cùng lúc.

| Làm gì | Quan sát gì |
|---|---|
| Nhà cung cấp từ chối kết nối trong 1,5 giây đầu. Tạo 1 đơn | Khoảng cách từ lần thử đầu đến lần thử cuối, trạng thái job, số thư |

| | Lần thử đầu → cuối | Trạng thái job | Số thư |
|---|---|---|---|
| Kết quả đúng | phải chờ qua sự cố | completed | **1** |
| Thực tế (bản gốc) | **14 ms** (5 lần) | **failed** ❌ | **0** ❌ |
| Bản sửa | 3066 ms (3 lần: 0 s → 1 s → 3 s) | completed ✅ | 1 ✅ |

### Khiếm khuyết 4 – Job hoàn tất không bao giờ bị xóa → Redis phình vô hạn

BullMQ mặc định giữ mọi job hoàn tất (hash dữ liệu + phần tử trong tập `completed`) và mọi job lỗi. Không có `removeOnComplete`/`removeOnFail` thì mỗi đơn để lại vĩnh viễn ít nhất một khóa trong Redis. Bộ nhớ tăng đều theo số đơn mỗi ngày và không bao giờ giảm, khớp với mức tăng 200 MB/ngày mà đội hạ tầng báo.

| Làm gì | Quan sát gì |
|---|---|
| Tạo 300 đơn, chờ gửi xong | Số job `completed` và số khóa `bull:<queue>:*` trong Redis |

| | Job completed còn lại | Số khóa của hàng đợi |
|---|---|---|
| Kết quả đúng | 0 | không tăng theo số đơn |
| Thực tế (bản gốc) | **300** ❌ | **305** ❌ (tăng tuyến tính) |
| Bản sửa | 0 ✅ | 4 ✅ (chỉ còn khóa quản trị của hàng đợi) |

## Phần 2 – Mã nguồn đã sửa

```ts
// email-queue.options.ts
export function confirmationJobOptions(orderId: string, backoffDelayMs = 1000): JobsOptions {
  return {
    jobId: `order-confirmation-${orderId}`,           // add() lặp cho cùng đơn không tạo job thứ hai
    attempts: 5,
    backoff: { type: 'exponential', delay: backoffDelayMs }, // chờ 1s, 2s, 4s, 8s       (K3)
    removeOnComplete: true,                            // job xong bị xóa khỏi Redis ngay   (K4)
    removeOnFail: { age: 7 * DAY_SEC, count: 1000 },   // job lỗi chỉ giữ có giới hạn      (K4)
  };
}

// email.processor.ts
async process(job: Job<ConfirmationJobData>) {
  const { orderId, email } = job.data;
  const sentId = await this.sentStore.sentMessageId(orderId);        // (K1, K2) đã gửi → bỏ qua
  if (sentId) return { sent: false, skipped: 'already-sent', messageId: sentId };

  const { messageId } = await this.mailer.sendConfirmation(
    email, orderId, EmailIdempotencyStore.providerKey(orderId),      // (K1, K2) cùng đơn = cùng khóa
  );
  await this.sentStore.markSent(orderId, messageId);                 // dấu "đã gửi", TTL 30 ngày
  return { sent: true, messageId };
}
```

Cách bản sửa xử lý từng gợi ý:

- **Khi job được thử lại:** có hai lớp chống trùng.
  - Lớp 1 là dấu `email:confirmation:sent:<orderId>` trong Redis. Lần thử nào thấy dấu này thì bỏ qua, không gửi nữa.
  - Lớp 2 là khóa `Idempotency-Key = order-confirmation-<orderId>` gửi kèm nhà cung cấp. Nó bọc khoảng hở giữa lúc "thư đã đi" và lúc "kịp ghi dấu" (timeout ở K1, tiến trình chết ở K2): lần gửi lại mang cùng khóa nên nhà cung cấp trả lại thư cũ, không gửi lần hai.
- **Khi job đã hoàn tất:** `removeOnComplete: true` xóa job khỏi Redis ngay. Việc chống trùng không còn dựa vào việc giữ job (job bị xóa thì `jobId` dùng lại được) mà dựa vào dấu "đã gửi". Dấu này chỉ vài chục byte và có TTL nên cũng không làm Redis phình. Job lỗi vẫn được giữ, nhưng tối đa 7 ngày và 1000 bản để còn điều tra.
- **Thời gian chờ giữa các lần thử:** backoff lũy thừa 1s → 2s → 4s → 8s, tổng khoảng 15 giây, đủ để vượt các sự cố ngắn của nhà cung cấp mà không dội request vào lúc họ đang lỗi.

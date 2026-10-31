# Bài tập 6 – Điền khuyết cơ chế tắt tiến trình an toàn

| Tệp | Nội dung |
|---|---|
| `src/main.ts` | chỗ khuyết (1) và lưới an toàn buộc thoát |
| `src/invoice/invoice.processor.ts` | chỗ khuyết (2), (3) |
| `src/config/queue.config.ts` | chỗ khuyết (3) (hằng số), (4), (5) |
| `src/demo/shutdown-demo.ts` | chạy thử bằng tiến trình và tín hiệu thật → `logs/shutdown-run.log` |
| `test/shutdown.test.ts` | kiểm thử tự động (`npm test`) |

## Điều gì xảy ra với công việc đang chạy khi tiến trình bị dừng (mã gốc)

Mã gốc không nghe tín hiệu tắt. Khi bị SIGTERM, Node thoát ngay, nên `renderPdf` (khoảng 1200 ms) bị cắt ngang và tệp PDF dở dang. Job vẫn nằm ở trạng thái `active` trong Redis với một khóa không còn ai gia hạn. Mã gốc cũng không cấu hình phát hiện job bị bỏ rơi, nên job "treo ở trạng thái đang xử lý". Kết quả là khoảng 30 hóa đơn hỏng mỗi lần triển khai.

## Mã nguồn 5 chỗ khuyết

```ts
// main.ts
const app = await NestFactory.create(AppModule);
// (1) Bật lắng nghe tín hiệu tắt: SIGTERM (k8s/docker stop), SIGINT (Ctrl+C) → app.close() → chạy các hook
app.enableShutdownHooks(['SIGTERM', 'SIGINT']);
// lưới an toàn: quá SHUTDOWN_GRACE_MS + 5s mà dọn dẹp vẫn chưa xong thì process.exit(1), không treo vĩnh viễn
await app.listen(3000);
```

```ts
// invoice.processor.ts
@Processor('invoice-export', invoiceWorkerOptions)
export class InvoiceProcessor extends WorkerHost implements OnModuleDestroy {
  async process(job: Job) { /* renderPdf ~1200 ms → storage.upload */ }

  // (2) Hook chạy khi module bị hủy → đóng worker có trật tự
  async onModuleDestroy() {
    await this.worker.pause(true);                                  // ngừng lấy job mới ngay
    // (3) chờ job đang chạy xong, nhưng tối đa SHUTDOWN_GRACE_MS (mặc định 20 s)
    const finished = await this.waitUntilIdle(SHUTDOWN_GRACE_MS);
    if (finished) return this.worker.close();                       // ghi nhận completed đầy đủ rồi đóng
    await this.worker.close(true);                                  // quá hạn: đóng cưỡng bức, job để worker khác nhận
  }
}
```

```ts
// queue.config.ts
export const SHUTDOWN_GRACE_MS = 20_000;   // (3) < terminationGracePeriodSeconds (30 s) của hạ tầng
export const invoiceWorkerOptions = {
  concurrency: 5,
  // (4) Ngưỡng coi một job là bị bỏ rơi
  lockDuration: 30_000,      // khóa không được gia hạn trong 30 s → job bị coi là bỏ rơi
  stalledInterval: 30_000,   // chu kỳ worker còn sống quét job bỏ rơi và trả về hàng đợi
  maxStalledCount: 2,        // bị bỏ rơi quá 2 lần → failed (tránh job "độc" làm sập worker mãi)
  // (5) Gia hạn khóa khi job chạy lâu hơn ngưỡng trên
  lockRenewTime: 10_000,     // worker tự gia hạn khóa mỗi 10 s cho từng job đang chạy
};
```

Ghi chú về (3): không dùng `Promise.race([worker.close(), timeout])`. `worker.close()` của BullMQ không tự hết giờ và **chỉ chạy một lần**: lần gọi đầu được ghi nhớ, nên gọi `close(true)` sau đó chỉ trả lại đúng promise đang chờ, và tiến trình vẫn treo. Bản đầu tiên trong lúc làm bài mắc đúng lỗi này. Vì vậy bản nộp dùng `pause(true)`, tự chờ có hạn, rồi chỉ gọi `close` **một lần** với tham số phù hợp.

Ghi chú về (5): việc gia hạn chạy trên vòng lặp sự kiện. Nếu `renderPdf` là đoạn tính toán chặn CPU nhiều giây liền thì khóa không được gia hạn. Khi đó cần chạy bước dựng PDF trong worker thread hoặc sandboxed processor của BullMQ.

## Log một lần chạy thử (`logs/shutdown-run.log`)

Bản demo chạy worker thật (`node dist/src/main.js`) và gửi tín hiệu thật. Trên Windows, `kill('SIGTERM')` giết tiến trình ngay chứ không gửi tín hiệu, nên demo được chạy trong container Linux:

```bash
npm run build
docker run --rm -v "$PWD:/app" -w /app -e REDIS_URL=redis://host.docker.internal:6379 node:22-alpine node dist/src/demo/shutdown-demo.js
```

Trích kịch bản 1: gửi SIGTERM khi đang có 5 job chạy dở (mốc thời gian tính từ lúc demo bắt đầu).

```
  +34.56s [demo] Dang chay: {"wait":0,"active":5,"completed":0,"failed":0,"delayed":0} -> gui SIGTERM
  +34.56s [worker-1] LOG [Shutdown] Nhan SIGTERM
  +34.56s [worker-1] LOG [InvoiceProcessor] Dang tat: ngung nhan job moi, cho 5 job dang chay [INV-001, INV-002, INV-003, INV-004, INV-005] (toi da 20000 ms)
  +35.75s [worker-1] LOG [InvoiceProcessor] Hoan tat INV-001
  +35.75s [worker-1] LOG [InvoiceProcessor] Hoan tat INV-005
  +35.75s [worker-1] LOG [InvoiceProcessor] Hoan tat INV-003
  +35.75s [worker-1] LOG [InvoiceProcessor] Hoan tat INV-004
  +35.75s [worker-1] LOG [InvoiceProcessor] Hoan tat INV-002
  +35.78s [worker-1] LOG [InvoiceProcessor] Worker da dong sau 1216 ms, moi job dang chay deu hoan tat
  +35.79s [demo] worker-1 da thoat (code=null, signal=SIGTERM)
  +35.79s [demo] Trang thai hang doi sau khi thoat: {"wait":0,"active":0,"completed":5,"failed":0,"delayed":0}
  +35.80s [demo] Tep PDF da luu: 5 -> INV-001.pdf, INV-002.pdf, INV-003.pdf, INV-004.pdf, INV-005.pdf
```

Log cho thấy cả 5 job hoàn tất và 5 tệp PDF được lưu **trước khi** tiến trình thoát. Thời gian tắt là 1,2 s, đúng bằng thời gian còn lại của job.

## Bẫy dữ liệu

### Bẫy 1 – Job chạy quá lâu, vượt cả thời gian chờ tắt

Hết `SHUTDOWN_GRACE_MS` thì worker đóng cưỡng bức và tiến trình thoát đúng hạn, không treo. Job dở vẫn nằm ở `active` nhưng khóa không còn được gia hạn. Sau `lockDuration`, worker còn sống phát hiện job bị bỏ rơi và trả nó về hàng đợi. Nếu Node vẫn bị kẹt vì lý do khác, lưới an toàn trong `main.ts` sẽ `process.exit(1)`.

Trích kịch bản 2 (demo đặt thời gian chờ 2 s, job dài 6 s, `lockDuration` 3 s):

```
  +71.34s [worker-1] LOG [InvoiceProcessor] Dang tat: ngung nhan job moi, cho 1 job dang chay [INV-LONG] (toi da 2000 ms)
  +73.36s [worker-1] WARN [InvoiceProcessor] Qua 2000 ms van con [INV-LONG] - dong cuong buc, job se duoc worker khac nhan lai
  +73.37s [demo] worker-1 da thoat (code=null, signal=SIGTERM), khong treo
  +73.38s [demo] Trang thai ngay sau khi thoat: {"wait":0,"active":1,"completed":0,"failed":0,"delayed":0}
 +109.88s [worker-2] LOG [InvoiceProcessor] Bat dau INV-LONG (lan 2)
 +115.89s [worker-2] LOG [InvoiceProcessor] Hoan tat INV-LONG
```

### Bẫy 2 – Tiến trình bị dừng ngay (SIGKILL/OOM), không kịp dọn dẹp

Không có hook nào chạy được trong trường hợp này. Cơ chế (4) bảo đảm job không mất: khóa của 5 job hết hạn, worker mới quét theo `stalledInterval`, phát hiện 5 job bị bỏ rơi và chạy lại chúng (`lan 2`). `maxStalledCount: 2` ngăn một job cứ làm sập tiến trình bị chạy lại mãi.

```
 +126.67s [demo] worker-1 bi giet (signal=SIGKILL); hang doi: {"wait":0,"active":5,"completed":0,"failed":0,"delayed":0}
 +161.50s [worker-2] LOG [InvoiceProcessor] Bat dau INV-101 (lan 2)   ... INV-105 (lan 2)
 +162.78s [demo] Sau khi worker-2 nhan lai: {"wait":0,"active":0,"completed":5,"failed":0,"delayed":0}
```

Vì job có thể bị chạy lại, bước lưu tệp ghi theo `invoiceId` (`<invoiceId>.pdf`). Chạy lại thì ghi đè đúng tệp đó, không sinh tệp trùng.

## Kiểm thử tự động (`npm test`)

| Kiểm thử | Kết quả |
|---|---|
| `app.close()` khi 5 job đang chạy → 5 job completed, 5 PDF, tắt trong 1–2 s | ✅ |
| Job 4 s, thời gian chờ 2 s → tắt sau 2–3 s, job còn `active`; tiến trình mới chạy lại (`attemptsStarted = 2`) | ✅ |
| SIGKILL tiến trình worker khi 5 job đang chạy → tiến trình khác chạy lại cả 5 | ✅ |

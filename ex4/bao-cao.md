# Bài tập 8 – Chọn kiến trúc xử lý cho 500.000 email chiến dịch

```
src/
  config/email.config.ts               số liệu bài toán, các ngưỡng tốc độ đã chọn
  provider/email-provider.ts           client HTTP tới nhà cung cấp, phân loại lỗi (550 / 429 / 5xx)
  provider/fake-provider-server.ts     nhà cung cấp giả lập: 100 lần/giây, vượt thì chặn 10 phút, tính mọi lần gọi
  rate-limit/provider-rate-limiter.ts  bộ giới hạn cửa sổ trượt dùng chung (Redis + Lua) cho mọi tiến trình
  campaign/campaign.loader.ts          kiểm tra định dạng, loại trùng, nạp hàng đợi theo lô 1.000
  campaign/campaign.worker.ts          gửi email chiến dịch, chống gửi trùng, phân loại lỗi
  campaign/campaign.stats.ts           tiến độ thời gian thực (bộ đếm trong Redis)
  campaign/campaign.control.ts         tạm dừng / tiếp tục / dừng hẳn
  transactional/transactional.worker.ts  email giao dịch: hàng đợi riêng, được ưu tiên
  main.ts                              một tiến trình xử lý (chạy tối đa 4 bản)
  benchmark.ts                         chạy thử với 4 tiến trình thật → logs/benchmark.log
```

Chạy: `npm run bench` (mặc định `BENCH_N=4000`), `npm test`. Cần Redis tại `REDIS_URL`.

## A. Phân tích và đề xuất giải pháp

### Đầu vào / đầu ra

- **Đầu vào:** danh sách 500.000 khách (`customerId`, `email`, `name`), mẫu nội dung khuyến mãi và hạn chót 2 giờ.
- **Đầu ra:**
  - mỗi khách hợp lệ nhận **đúng 1** email đã cá nhân hóa (tên, mã ưu đãi riêng);
  - tiến độ theo thời gian thực (đã gửi, không tồn tại, lỗi, tốc độ, ETA);
  - điều khiển được: dừng giữa chừng, tiếp tục, dừng hẳn.

### Thông lượng tối thiểu

```
500.000 email / (2 × 3.600 s) = 69,4 email/giây
```

- Khoảng 3% (15.000) địa chỉ sai định dạng bị loại trước khi gửi, nên thực tế chỉ cần 485.000 / 7.200 = 67,4/s. Bài làm vẫn lấy **69,4/s** làm mục tiêu vì địa chỉ không tồn tại chỉ lộ ra sau khi đã gọi nhà cung cấp, và vẫn bị tính phí.
- Trần của nhà cung cấp là 100/s, **dùng chung với email giao dịch**. Vượt trần thì bị chặn 10 phút. 10 phút bị chặn làm mất khoảng 42.000 email chiến dịch và làm tê liệt cả email xác nhận đơn hàng. Vì vậy không được phép chạm trần, kể cả một giây.
- Chỉ cần khoảng 76 × 0,1 s ≈ 8 lời gọi đồng thời. Với 4 tiến trình × 10 job song song, điểm nghẽn là **giới hạn của nhà cung cấp**, không phải CPU hay số tiến trình.

### Các giải pháp khả thi

| | Ý tưởng |
|---|---|
| **(a) Một hàng đợi, nhiều tiến trình** | Email chiến dịch và giao dịch chung một hàng đợi, BullMQ limiter 95 job/s |
| **(b) Tách hàng đợi theo ưu tiên** | Hàng đợi `transactional` và `campaign` riêng, mỗi hàng đợi một limiter cố định (ví dụ 75/s + 20/s) |
| **(c) Chia lô** | Mỗi job là một lô 1.000 người nhận, worker tự gửi tuần tự trong lô |
| **(d) Hàng đợi ưu tiên + giới hạn tốc độ ở tầng xử lý** | Hai hàng đợi riêng như (b). Thêm **một bộ đếm cửa sổ trượt dùng chung trong Redis** đếm đúng số lần gọi nhà cung cấp của mọi tiến trình: email giao dịch được ưu tiên, chiến dịch tự nhường |

## B. So sánh và lựa chọn

| Tiêu chí | (a) Một hàng đợi | (b) Tách hàng đợi | (c) Chia lô | (d) Ưu tiên + giới hạn ở tầng xử lý |
|---|---|---|---|---|
| Thông lượng đạt được | ~95/s nhưng không bảo đảm dưới trần (đếm job chứ không đếm lần gọi; thử lại và lỗi 550 vẫn tốn lượt) | 75/s cố định | Khó kiểm soát: tốc độ nằm trong vòng lặp của từng lô, 4 lô song song dễ vượt trần | **~76/s**, đo được 74,4/s (bao gồm cả lúc tạm dừng) |
| Không làm chậm email giao dịch | ❌ Email xác nhận xếp sau 500.000 email chiến dịch, trễ tới 2 giờ | ✅ nhưng bị kẹp ở 20/s kể cả lúc chiến dịch đang rảnh | ❌ nếu chung hàng đợi; ✅ nếu tách | ✅ hàng đợi riêng, luôn còn suất trống, chiến dịch tự nhường khi giao dịch tăng (đo p95 = 182 ms) |
| Dừng giữa chừng | Khó: dừng hàng đợi thì dừng cả email giao dịch | ✅ dừng riêng hàng đợi chiến dịch | ❌ lô đang chạy phải chạy hết 1.000 email; thử lại lô thì gửi trùng | ✅ dừng ngay, chỉ còn tối đa 40 job đang gọi dở |
| Chi phí hạ tầng | Thấp | Thấp | Thấp nhất (ít job, ít ghi Redis) | Thấp: 1 ZSET vài trăm phần tử, 1 lệnh Lua mỗi email |
| Độ phức tạp vận hành | Thấp nhưng rủi ro bị chặn cao | Thấp | Cao: theo dõi tiến độ và chống trùng trong từng lô | Trung bình: thêm một bộ giới hạn |

**Chọn (d).** Lý do bám theo các ràng buộc:

- **Trần 100 email/giây của nhà cung cấp** là ràng buộc quyết định.
  - Trần này tính theo *lần gọi*, chung cho *mọi loại email*, và áp cho *toàn bộ 4 tiến trình*.
  - Chỉ (d) đếm đúng đại lượng đó, ở đúng chỗ (Redis, dùng chung).
  - Limiter của BullMQ trong (a) và (b) đếm *job được lấy ra*, không đếm lời gọi thật, và không biết hàng đợi kia đang dùng bao nhiêu.
- **Không chậm email giao dịch:** hàng đợi riêng cộng quyền ưu tiên trong bộ giới hạn.
- **Dừng được giữa chừng:** đơn vị công việc là một email, nên dừng có hiệu lực ngay và không gửi trùng khi tiếp tục.

## C. Thiết kế và triển khai

### Các bước thực hiện

1. **Nạp danh sách** (`campaign.loader.ts`):
   - chuẩn hóa email (bỏ khoảng trắng, chữ thường);
   - loại địa chỉ sai định dạng (bẫy 3%) **trước khi gửi**, nên không tốn lượt gọi hay phí;
   - loại trùng theo `customerId` **và** theo địa chỉ email;
   - `addBulk` theo lô 1.000 job, `jobId = <campaignId>-<email>`.
2. **4 tiến trình xử lý** (`main.ts`, `MAX_PROCESSES = 4`, bẫy giới hạn hạ tầng). Mỗi tiến trình chạy worker chiến dịch (10 job song song) và worker giao dịch (10). Mọi giới hạn tốc độ đều nằm trong Redis nên đúng cho cả 4 tiến trình cộng lại.
3. **Xin suất gọi** (`provider-rate-limiter.ts`, Lua nguyên tử, đồng hồ Redis `TIME`):

   | Loại | Điều kiện được gọi |
   |---|---|
   | Giao dịch | tổng < **90**/giây và < 9/100 ms |
   | Chiến dịch | riêng chiến dịch < **76**/giây và < 8/100 ms, **và** tổng < 85/giây (luôn để sẵn ≥ 5 suất/giây cho giao dịch gọi ngay) |

   Lần chạy đầu chỉ dùng cửa sổ 1 giây và nhà cung cấp đo được **111/s**: suất được cấp dồn cụm ở đầu giây, cộng thêm độ trễ mạng thì một giây phía nhà cung cấp chứa nhiều hơn 100 lượt. Cửa sổ con 100 ms dàn đều lượt gọi, nên dù độ trễ lệch tới 100 ms, nhà cung cấp vẫn thấy tối đa 90 + 9 = 99 lượt/giây.
4. **Gửi** kèm `idempotency-key = <campaignId>-<email>`. Nội dung được cá nhân hóa trong `render()`.
5. **Phân loại lỗi:**
   - `550` (không tồn tại) → `UnrecoverableError`, **không thử lại**, đếm vào `invalidRecipient`;
   - `5xx`/timeout → thử lại 3 lần, backoff 5 s, 10 s;
   - `429` → cả hàng đợi chiến dịch chờ hết thời gian bị chặn (`queue.rateLimit`), không đốt lượt thử.

### Bảo đảm không gửi trùng (4 lớp)

1. Loại trùng khi nạp (trùng mã khách, trùng địa chỉ sau chuẩn hóa).
2. `jobId` cố định: nạp lại danh sách không tạo job thứ hai.
3. Dấu `campaign:<id>:sent:<email>` (TTL 30 ngày). Job chạy lại vì thử lại, tiến trình chết hoặc nạp lại thì thấy dấu và bỏ qua.
4. `idempotency-key` gửi nhà cung cấp. Bọc khoảng hở "nhà cung cấp đã gửi nhưng tiến trình chết trước khi ghi dấu".

### Theo dõi tiến độ và dừng giữa chừng

- `CampaignStats`: các bộ đếm `HINCRBY` trong Redis, tiến trình nào cũng cập nhật. `progress()` trả về `% hoàn thành`, `đã gửi / không tồn tại / lỗi / đã hủy`, tốc độ thực tế và ETA. `benchmark.ts` in ra mỗi 2 giây.
- `CampaignControl`:
  - `pause()` / `resume()` (toàn cục, có hiệu lực ngay với cả 4 tiến trình);
  - `cancel()` đặt trạng thái `cancelled` trước (job đã được lấy ra cũng không gửi), rồi xóa phần còn lại.
- Hàng đợi giao dịch tách riêng nên không bị ảnh hưởng.

### Kết quả chạy thử (`logs/benchmark.log`)

4.000 khách (121 sai định dạng, 19 trùng, 19 không tồn tại), 4 tiến trình worker thật, email giao dịch chạy nền 10/s, tạm dừng 3 s ở mốc 40%:

| Chỉ số | Kết quả |
|---|---|
| Email chiến dịch nhà cung cấp thực sự gửi | 3.841, **trùng địa chỉ: 0** |
| Địa chỉ không tồn tại | 19, mỗi địa chỉ chỉ bị gọi 1 lần |
| Đỉnh tại nhà cung cấp | **90 lần/giây** (trần 100), **bị chặn: 0** |
| Thông lượng chiến dịch | **74,4 email/s** ≥ 69,4 yêu cầu |
| Email giao dịch trong lúc chiến dịch chạy hết công suất | 532 email, p50 = 109 ms, p95 = 182 ms |
| Tạm dừng | sau 3 s chỉ tăng 40 email (đúng bằng số job đang gọi dở = 4 × 10), rồi chạy tiếp |
| Ngoại suy 500.000 khách (~485.000 hợp lệ) | **109 phút** < 120 phút |

### Kiểm thử (`npm test`)

| Kiểm thử | Kết quả |
|---|---|
| Kiểm tra định dạng email (hợp lệ / `@@` / có khoảng trắng / thiếu `@` / thiếu tên miền cấp cao) | ✅ |
| Nạp 1.002 dòng: 30 sai định dạng, 2 trùng, 970 job; nạp lại vẫn 970 job | ✅ |
| 4 bộ giới hạn tranh nhau trong 3 giây: tổng ≤ 90/s, chiến dịch ≤ 76/s, giao dịch vẫn ≥ 10/s | ✅ |
| 400 khách + 5% lỗi 503 ngẫu nhiên + 30 email giao dịch: không trùng, 8 địa chỉ không tồn tại gọi đúng 1 lần, không bị chặn | ✅ |
| Tạm dừng: không gửi thêm; tiếp tục: gửi đủ 300 | ✅ |
| Dừng hẳn: phần còn lại không bao giờ được gửi, `sent + cancelled = 300` | ✅ |

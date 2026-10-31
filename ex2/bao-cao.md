# Bài tập 6 – Điền khuyết cơ chế chống dồn dập khi khoá hết hạn

Hàm gốc: `src/product.service.original.ts` · Hàm đã điền 5 chỗ khuyết: `src/product.service.ts`
Kiểm thử: `npm test` (`test/product.lock.test.ts`) · Đo tải: `npm run bench` → `logs/benchmark.log`

Mã chạy với `ioredis`; khi kiểm thử/đo tải dùng `ioredis-mock` (cùng API, nhiều kết nối dùng chung dữ liệu như nhiều instance cùng trỏ vào một Redis).

## 1. Năm chỗ khuyết

```ts
async getProductWithLock(id: string): Promise<Product> {
  const key = productKey(id);                       // shopfast:product:<id>
  const cached = await this.redis.get(key);
  if (cached) return JSON.parse(cached);

  // (1) giành khoá phân tán trước khi xuống DB
  const lockKey = lockKeyOf(key);                   // shopfast:product:<id>:lock
  const token = randomUUID();
  const acquired = await this.tryLock(lockKey, token);   // SET lockKey token PX 5000 NX

  // (2) không giành được khoá -> chờ rồi đọc lại cache, có giới hạn số lần
  if (!acquired) return this.waitForCache(id, key, lockKey, token);

  return this.rebuild(id, key, lockKey, token);
}

private async rebuild(...) {
  try {
    const product = await this.repo.findById(id);
    // (3) độ lệch ngẫu nhiên cho thời gian sống: 300 + [0..60] giây
    const ttl = CACHE_TTL_SEC + randomInt(0, CACHE_TTL_JITTER_SEC + 1);
    await this.redis.set(key, JSON.stringify(product), 'EX', ttl);
    return product;
  } finally {
    // (4) giải phóng khoá phân tán (Lua: chỉ xoá nếu token khớp)
    // (5) nằm trong finally -> vẫn giải phóng khi truy vấn DB ném lỗi
    await this.redis.eval(RELEASE_LOCK_SCRIPT, 1, lockKey, token);
  }
}
```

| Chỗ khuyết | Cách điền | Lý do |
|---|---|---|
| (1) Giành khoá | `SET <key>:lock <token> PX 5000 NX` | `NX` là thao tác nguyên tử của Redis → giữa mọi instance chỉ một request nhận `OK`. `PX 5000` → **khoá tự hết hạn sau 5 giây**, tiến trình giữ khoá bị chết thì hệ thống không kẹt vĩnh viễn. |
| (2) Không giành được khoá | Cứ 50 ms đọc lại cache, **tối đa 40 lần (≈2 giây)**; hết lượt → `503 Service Unavailable` | Không lặp vô tận. Nếu trong lúc chờ khoá đã được giải phóng mà cache vẫn trống (người giữ khoá gặp lỗi DB hoặc chết), request đang chờ thử giành khoá và tự dựng lại → vẫn chỉ một request xuống DB tại một thời điểm. |
| (3) Độ lệch TTL | `300 + randomInt(0..60)` giây | Các khoá được dựng cùng lúc (sau deploy, sau flush) không hết hạn cùng một giây. |
| (4) Giải phóng khoá | Script Lua `if GET == token then DEL` | Nếu request chạy quá 5 giây, khoá cũ đã hết hạn và request khác đang giữ khoá mới → so token để không xoá nhầm khoá của người khác. GET + DEL trong Lua là nguyên tử. |
| (5) Giải phóng khi DB lỗi | Đặt (4) trong `finally` | Lỗi DB vẫn được ném ra cho request đó, nhưng khoá được nhả **ngay**, không bắt các request sau chờ 5 giây. |

## 2. Kết quả đo tải

Kịch bản (`src/benchmark.ts`): 4 instance ứng dụng (4 kết nối Redis riêng, chung dữ liệu), DB trễ 300 ms. Xoá bản ghi đệm (mô phỏng khoá vừa hết hạn) rồi bắn **200 request đồng thời** cho cùng sản phẩm flash sale; lặp 5 lần.

`logs/benchmark.log`:

```
## TRUOC - ham goc chua co khoa
lan 1: 200 truy van DB | 200/200 request thanh cong | 307 ms
lan 2: 200 truy van DB | 200/200 request thanh cong | 307 ms
lan 3: 200 truy van DB | 200/200 request thanh cong | 314 ms
lan 4: 200 truy van DB | 200/200 request thanh cong | 312 ms
lan 5: 200 truy van DB | 200/200 request thanh cong | 313 ms
=> trung binh 200.0 truy van DB / lan het han

## SAU - khoa phan tan + do lech TTL
lan 1: 1 truy van DB | 200/200 request thanh cong | 371 ms
lan 2: 1 truy van DB | 200/200 request thanh cong | 318 ms
lan 3: 1 truy van DB | 200/200 request thanh cong | 372 ms
lan 4: 1 truy van DB | 200/200 request thanh cong | 316 ms
lan 5: 1 truy van DB | 200/200 request thanh cong | 371 ms
=> trung binh 1.0 truy van DB / lan het han
```

Số truy vấn CSDL tại thời điểm khoá hết hạn giảm từ **200 xuống 1**, cả 200 request đều nhận được dữ liệu. Thời gian thêm vào ≤ 1 nhịp chờ 50 ms. (Ở hệ thống thật, giảm 200 truy vấn xuống 1 cũng giúp DB không bị dồn tải nên thời gian phản hồi không vọt lên 3 giây.)

## 3. Kiểm thử bẫy dữ liệu (`npm test`)

| Test | Kết quả |
|---|---|
| Hàm gốc, 200 request cùng lúc | 200 truy vấn DB |
| Có khoá, 200 request cùng lúc | 1 truy vấn DB, 200/200 thành công |
| 4 instance × 50 request | 1 truy vấn DB |
| Khoá có PTTL ∈ (0, 5000] ms và được xoá ngay khi dựng xong | ✅ |
| TTL bản ghi đệm ∈ [300, 360] giây và khác nhau giữa các lần | ✅ |
| Không xoá khoá đang thuộc về token khác | ✅ |
| **DB ném lỗi giữa chừng** → khoá được giải phóng ngay, request sau đọc bình thường | ✅ |
| DB lỗi khi 50 request đang chờ → chỉ 1 request nhận lỗi, request chờ tự giành khoá dựng lại; tổng 2 truy vấn | ✅ |
| **Khoá bị giữ mà cache không bao giờ được dựng** → request chờ bỏ cuộc sau 40 × 50 ms, trả 503, không xuống DB | ✅ |

```
# tests 9
# pass 9
# fail 0
```

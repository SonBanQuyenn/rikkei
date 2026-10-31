# Bài tập 7 – Tầng bộ nhớ đệm cho trang danh mục có bộ lọc

Mã nguồn: `src/catalog/*` · Kiểm thử: `npm test` (`test/catalog.test.ts`) · Chạy thử: `npm start` (có `REDIS_URL` thì dùng Redis thật, không thì dùng Redis giả lập trong bộ nhớ).

## A. Báo cáo phân tích và thiết kế giải pháp

### 1. Phân tích bài toán (I/O)

**Đầu vào – `GET /catalog?...`**

| Tham số | Kiểu | Ràng buộc | Ảnh hưởng tới kết quả |
|---|---|---|---|
| `category` | string, 1 giá trị | thuộc danh sách danh mục (`ao, quan, giay, tui, phu-kien`); bỏ trống = mọi danh mục | Lọc sản phẩm; **quyết định nhóm vô hiệu hoá** |
| `brand` | string, nhiều giá trị (`brand=a,b` hoặc `brand=a&brand=b`) | mỗi giá trị thuộc danh sách thương hiệu, tối đa 3 | Lọc sản phẩm; thứ tự không quan trọng |
| `minPrice`, `maxPrice` | số nguyên (đồng) | chỉ nhận các mốc giá giao diện cho chọn: `0, 100000, 200000, 300000, 500000, 1000000, 2000000, 5000000`; `min < max` | Lọc theo khoảng giá `[min, max)` – **phụ thuộc giá** nên đổi giá có thể làm sản phẩm lọt vào/ra khỏi kết quả |
| `sort` | enum | `price_asc` (giá tăng) · `newest` (mới nhất) · `best_selling` (bán chạy, mặc định) | Thứ tự; `price_asc` phụ thuộc giá |
| `page` | số nguyên | 1..1000, mặc định 1; trang 20 sản phẩm | Chỉ trang 1–3 được đệm |
| tham số khác (`utm_source`, `fbclid`…) | – | bỏ qua | Không ảnh hưởng, **không tham gia vào khoá** |

**Đầu ra được lưu đệm** – chuỗi JSON của một trang kết quả:

```json
{ "items": [ { "id": "P001", "name": "...", "category": "ao", "brand": "nike",
               "price": 120000, "stock": 12, "sold": 37, "createdAt": 1700000060000 } ],
  "total": 80, "page": 1, "pageSize": 20 }
```

Mỗi trang chứa **giá** (phải chính xác tuyệt đối) và **tồn kho** (được trễ tối đa 60 giây) – hai loại dữ liệu có yêu cầu độ tươi khác nhau nằm chung một bản ghi.

### 2. Ý tưởng giải pháp

**Sinh khoá từ tập tham số**
1. Kiểm tra theo danh sách cho phép (danh mục, thương hiệu, mốc giá, kiểu sắp xếp, trang) → sai là `400`, **không sinh khoá, không chạm CSDL**.
2. Chuẩn hoá: chữ thường, cắt khoảng trắng; brand bỏ trùng + sắp xếp; `minPrice=0` coi như không lọc; điền giá trị mặc định; bỏ tham số lạ.
3. Ghép theo **thứ tự cố định**, không phụ thuộc thứ tự người dùng gửi:

```
catalog:<nhóm>:v<phiên bản nhóm>:b=<brand,...|*>|p=<min>-<max>|s=<sort>|pg=<page>
vd: catalog:ao:v3:b=adidas,nike|p=100000-500000|s=price_asc|pg=1
```

`<nhóm>` là danh mục (hoặc `*` khi không lọc danh mục).

**Thời gian sống**

| Dữ liệu | Độ tươi yêu cầu | Cách đảm bảo |
|---|---|---|
| Tồn kho | trễ ≤ 60 giây | TTL của mọi bản ghi = **60 giây**. Không xoá ngay khi tồn kho đổi vì tồn kho đổi theo từng đơn hàng – giờ cao điểm xoá liên tục thì tỉ lệ trúng gần bằng 0. |
| Giá | chính xác tuyệt đối | Vô hiệu hoá **ngay lập tức** theo nhóm (dưới đây), không chờ TTL. |
| Trang ≥ 4 | – | Không đệm. |

**Nhóm khoá để vô hiệu hoá hàng loạt – số phiên bản theo nhóm**
- Mỗi nhóm có một bộ đếm `catalog:ver:<danh mục>` và `catalog:ver:*`. Phiên bản nằm trong khoá.
- Đổi giá sản phẩm thuộc danh mục `c` → `INCR catalog:ver:c` và `INCR catalog:ver:*` (một `MULTI`). Mọi khoá cũ của 2 nhóm này không còn ai đọc tới và tự hết hạn sau ≤ 60 giây.
- Vì sao vô hiệu theo **cả danh mục** chứ không chỉ các khoá đang chứa sản phẩm: đổi giá có thể làm sản phẩm **lọt vào** một khoảng giá mà trước đó nó không có mặt (hoặc đổi vị trí khi sắp theo giá) – chỉ mục ngược “sản phẩm → khoá chứa nó” không bắt được trường hợp này. Mọi kết quả có thể chứa sản phẩm ở danh mục `c` chắc chắn thuộc nhóm `c` hoặc nhóm `*`, nên tăng 2 phiên bản là đủ và đúng. Các danh mục khác giữ nguyên bản đệm.
- Vô hiệu hoá O(1), không phải quét/xoá hàng nghìn khoá. Còn tránh được tình huống tranh chấp: request đọc phiên bản v, truy vấn CSDL 800 ms, trong lúc đó giá đổi → phiên bản thành v+1; request ghi kết quả cũ vào khoá v – khoá này không ai đọc nữa nên giá cũ không bao giờ lộ ra.

**Giới hạn tổng số khoá**
- Nhờ danh sách cho phép, không gian khoá là hữu hạn: 6 nhóm × 93 tổ hợp brand (0–3 trong 8) × 36 khoảng giá × 3 sắp xếp × 3 trang = **180.792** tổ hợp tối đa về lý thuyết.
- Thêm trần cứng `DEFAULT_MAX_KEYS = 20.000` (~20 sản phẩm × ~200 B ≈ 4 KB/khoá → ≤ ~80 MB). Registry là ZSET `catalog:keys` (khoá → thời điểm hết hạn). Script Lua nguyên tử: dọn khoá đã hết hạn → đếm → nếu đầy và là khoá mới thì **không ghi** (vẫn trả kết quả từ CSDL, `cache: "MISS_NOT_STORED"`).

### 3. Các bước xử lý

**Luồng một request danh mục**

1. Nhận `GET /catalog?...`.
2. `parseCatalogQuery`: kiểm tra danh sách cho phép → sai thì trả `400`.
3. Chuẩn hoá tham số.
4. `page > 3` → truy vấn CSDL, trả về (`BYPASS`).
5. `scope = category ?? "*"`; `GET catalog:ver:<scope>` → phiên bản v.
6. Ghép khoá `catalog:<scope>:v<v>:<tham số chuẩn hoá>`; `GET` khoá.
7. Trúng → trả về (`HIT`, < 20 ms).
8. Trượt → truy vấn CSDL (~800 ms) → script Lua ghi `SET … EX 60` + đăng ký vào ZSET nếu chưa chạm trần → trả về (`MISS` / `MISS_NOT_STORED`).

**Luồng khi một sản phẩm được cập nhật**

- `PATCH /products/:id/price`
  1. Ghi giá mới vào CSDL.
  2. `MULTI INCR catalog:ver:<danh mục của sản phẩm>; INCR catalog:ver:*; EXEC`.
  3. Request kế tiếp của các nhóm này đọc phiên bản mới → trượt → lấy giá mới từ CSDL.
- `PATCH /products/:id/stock`
  1. Ghi tồn kho mới vào CSDL.
  2. Không xoá bản đệm; mọi kết quả chứa sản phẩm được làm mới khi hết TTL 60 giây (đúng giới hạn trễ cho phép).

## B. Triển khai và chống lỗi

| Thành phần | File |
|---|---|
| Kiểm tra + chuẩn hoá tham số, sinh phần khoá | `src/catalog/catalog-query.ts` |
| Truy cập Redis: phiên bản nhóm, đọc/ghi có trần, vô hiệu hoá | `src/catalog/catalog-cache.ts` |
| Luồng request / luồng cập nhật | `src/catalog/catalog.service.ts` |
| CSDL giả lập (truy vấn 800 ms) | `src/catalog/catalog.repository.ts` |
| HTTP: `GET /catalog`, `PATCH /products/:id/price`, `PATCH /products/:id/stock` | `src/app.ts` |

### Chặn từng bẫy dữ liệu

**Bẫy 1 – cùng nội dung, khác thứ tự tham số** (`catalog-query.ts`)

```ts
const brandList = [...new Set(brandValues.flatMap((v) => v.split(','))
  .map((b) => b.trim().toLowerCase()).filter(Boolean))].sort();
...
export function canonicalQuery(q: CatalogQuery): string {
  return [`b=${q.brands.join(',') || '*'}`, `p=${q.minPrice ?? 0}-${q.maxPrice ?? 'max'}`,
          `s=${q.sort}`, `pg=${q.page}`].join('|');
}
```

**Bẫy 2 – hàng nghìn tổ hợp vô nghĩa làm phình bộ nhớ đệm**

```ts
if (category !== undefined && !categories.includes(category)) throw bad(`Danh muc khong ton tai: ${category}`);
if (brandList.length > MAX_BRANDS) throw bad(`Chon toi da ${MAX_BRANDS} thuong hieu`);
for (const b of brandList) if (!brands.includes(b)) throw bad(`Thuong hieu khong ton tai: ${b}`);
if (!/^\d+$/.test(s) || !PRICE_STEPS.includes(n)) throw bad(`${name} phai la mot trong cac moc: ...`);
if (!SORTS.includes(sort)) throw bad(...);
```

kèm trần cứng số khoá (`catalog-cache.ts`):

```lua
redis.call('zremrangebyscore', KEYS[2], '-inf', ARGV[3])
if redis.call('zcard', KEYS[2]) >= tonumber(ARGV[4]) and not redis.call('zscore', KEYS[2], KEYS[1]) then
  return 0
end
redis.call('set', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('zadd', KEYS[2], ARGV[5], KEYS[1])
return 1
```

### Kết quả kiểm thử (`npm test`)

| Test | Kết quả |
|---|---|
| Lần đầu đi CSDL, lần sau trả về **< 20 ms**, CSDL chỉ bị truy vấn 1 lần | ✅ |
| Trang 1–3 được đệm, trang 4 luôn `BYPASS` | ✅ |
| Mọi bản ghi có TTL ≤ 60 giây | ✅ |
| Đổi giá → kết quả theo danh mục **và** kết quả không lọc danh mục thấy giá mới ngay | ✅ |
| Đổi giá làm sản phẩm **lọt vào** khoảng giá `< 100.000` đang được đệm → xuất hiện ngay | ✅ |
| Đổi giá ở danh mục khác → bản đệm danh mục này vẫn `HIT` | ✅ |
| Đổi tồn kho → trong 60 giây vẫn `HIT` (được phép), hết TTL thấy tồn kho mới | ✅ |
| 4 biến thể cùng nội dung (đảo thứ tự, HOA/thường, brand lặp, thêm `utm_source`) → 1 khoá, 1 truy vấn CSDL | ✅ |
| 1.003 tổ hợp vô nghĩa → toàn bộ `400`, **0 khoá**, **0 truy vấn CSDL** | ✅ |
| 50 request khác `fbclid` → 1 khoá | ✅ |
| Trần 3 khoá: khoá thứ 4 vẫn trả kết quả nhưng `MISS_NOT_STORED`, khoá cũ vẫn `HIT` | ✅ |

```
# tests 11
# pass 11
# fail 0
```

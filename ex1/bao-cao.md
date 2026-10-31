# Bài tập 5 – Vá lỗi bộ nhớ đệm phục vụ giá sai cho khách hàng

Mã gốc: `src/product.service.buggy.ts` · Bản đã sửa: `src/product.service.ts`
Kịch bản kiểm thử tự động: `test/product.cache.test.ts` (`npm test`), chạy cùng một kịch bản trên cả hai bản.

Dữ liệu mẫu trong CSDL: sản phẩm `A` – *Áo thun ShopFast* – 150.000đ (giá khuyến mãi), sản phẩm `B` – *Quần jean ShopFast* – 400.000đ.

## Phần 1 – Chỉ ra lỗi bằng dữ liệu

### Khiếm khuyết 1 – Khoá đệm cố định `"product"`: mọi sản phẩm dùng chung một bản ghi

`findOne` đọc/ghi khoá `"product"` mà không có `id`. Ai mở sản phẩm đầu tiên thì mọi sản phẩm khác đều trả về bản ghi đó.

| Bước | Lời gọi API |
|---|---|
| 1 | `GET /products/A` |
| 2 | `GET /products/B` |

| | Phản hồi bước 2 |
|---|---|
| Kết quả đúng | `{"id":"B","name":"Quần jean ShopFast","price":400000}` |
| Kết quả thực tế (bản lỗi) | `{"id":"A","name":"Áo thun ShopFast","price":150000}` ❌ |

→ Đây là sự cố *“khách mở sản phẩm A nhưng thấy thông tin sản phẩm B”* (hoặc ngược lại).

### Khiếm khuyết 2 – `update` không vô hiệu hoá bộ nhớ đệm

`update` chỉ ghi CSDL; bản ghi cũ vẫn nằm trong bộ nhớ đệm.

| Bước | Lời gọi API |
|---|---|
| 1 | `GET /products/A` → 150000 (được đưa vào bộ nhớ đệm) |
| 2 | `PATCH /products/A` body `{"price":120000}` |
| 3 | `GET /products/A` |

| | Phản hồi bước 3 |
|---|---|
| Kết quả đúng | `price: 120000` |
| Kết quả thực tế (bản lỗi) | `price: 150000` ❌ |

### Khiếm khuyết 3 – Không đặt thời gian sống: bản ghi đệm sống vĩnh viễn

`cache.set("product", product)` không truyền TTL, `CacheModule.register()` cũng không có TTL mặc định → bản ghi không bao giờ hết hạn. Giá thay đổi bằng đường khác ngoài `update()` (job kết thúc khuyến mãi, admin sửa thẳng CSDL, import giá…) sẽ không bao giờ được nhìn thấy.

| Bước | Thao tác |
|---|---|
| 1 | `GET /products/A` → 150000 (giá khuyến mãi) |
| 2 | Job kết thúc khuyến mãi ghi thẳng CSDL: giá A = 200000 |
| 3 | Một ngày sau: `GET /products/A` |

| | Phản hồi bước 3 |
|---|---|
| Kết quả đúng | `price: 200000` |
| Kết quả thực tế (bản lỗi) | `price: 150000` ❌ |

→ Đây là sự cố *“khách đặt hàng theo giá khuyến mãi đã kết thúc từ hôm qua”*.

Kết quả chạy trên bản lỗi (`describe('Ban LOI ...')`): cả 3 test đều xác nhận giá trị **thực tế sai** như bảng trên.

## Phần 2 – Source code đã sửa

`src/product.service.ts`:

```ts
export const PRODUCT_CACHE_TTL_MS = 60_000;
export const productCacheKey = (id: string) => `shopfast:product:${id}`;

async findOne(id: string): Promise<Product> {
  const key = productCacheKey(id);
  const cached = await this.cache.get<Product>(key);
  if (cached) return cached;

  const product = await this.repo.findById(id);
  if (!product) throw new NotFoundException(`Khong tim thay san pham ${id}`);
  await this.cache.set(key, product, PRODUCT_CACHE_TTL_MS);
  return product;
}

async update(id: string, dto: UpdateProductDto): Promise<Product> {
  const product = await this.repo.update(id, dto);
  if (!product) throw new NotFoundException(`Khong tim thay san pham ${id}`);
  await this.cache.del(productCacheKey(id));
  return product;
}
```

| Câu hỏi gợi ý | Cách xử lý |
|---|---|
| Khoá có phân biệt được các sản phẩm khác nhau không? | Khoá `shopfast:product:<id>` – mỗi sản phẩm một bản ghi riêng. |
| Bản ghi đệm sống bao lâu? | 60 giây (`PRODUCT_CACHE_TTL_MS`, đơn vị ms của cache-manager). Giá đổi qua đường khác `update()` cũng chỉ cũ tối đa 60 giây. |
| Điều gì xảy ra với bộ nhớ đệm sau khi dữ liệu được cập nhật? | Ghi CSDL xong thì `cache.del(key)` → request kế tiếp đọc giá mới từ CSDL và đệm lại. Xoá **sau** khi ghi để không có request nào kịp đệm lại giá cũ trong lúc chờ ghi. |

Ngoài ra không đệm kết quả `null` (sản phẩm không tồn tại → 404).

Kết quả chạy cùng kịch bản (`npm test`):

| Kịch bản | Bản lỗi | Bản sửa |
|---|---|---|
| K1 – `GET A` rồi `GET B` | trả về A ❌ | trả về B ✅ |
| K2 – `PATCH A {price:120000}` rồi `GET A` | 150000 ❌ | 120000 ✅ |
| K3 – Giá đổi thẳng trong CSDL, 1 ngày sau `GET A` | 150000 ❌ | 200000 ✅ |
| Đọc A 2 lần liên tiếp | – | CSDL chỉ bị truy vấn 1 lần ✅ |

```
# tests 8
# pass 8
# fail 0
```

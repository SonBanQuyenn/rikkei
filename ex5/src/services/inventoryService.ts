import { products } from "../data/mockDb.ts";
import { BusinessError } from "./errors.ts";

const LOW_STOCK = 10;

// San pham dang ban nhung het hang / ban vuot ton kho / sap het
export function getStockAlerts() {
  const onSale = products.filter((p) => p.onSale);
  return {
    oversold: onSale.filter((p) => p.available < 0).map(({ sku, name, available }) => ({ sku, name, available })),
    outOfStock: onSale.filter((p) => p.available === 0).map(({ sku, name }) => ({ sku, name })),
    lowStock: onSale
      .filter((p) => p.available > 0 && p.available <= LOW_STOCK)
      .map(({ sku, name, available }) => ({ sku, name, available })),
  };
}

// GHI: tam ngung ban mot san pham
export function pauseProductSales(sku: string, reason: string) {
  const product = products.find((p) => p.sku === sku);
  if (!product) throw new BusinessError(`Không tìm thấy sản phẩm ${sku}.`);
  if (!product.onSale) throw new BusinessError(`Sản phẩm ${sku} đã ngừng bán từ trước.`);
  if (!reason?.trim()) throw new BusinessError("Cần ghi rõ lý do ngừng bán.");
  product.onSale = false;
  return { sku, name: product.name, onSale: false, reason: reason.trim() };
}

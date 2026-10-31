import { InvalidPayloadError, requireFields, type TaskDefinition } from './task.types.js';

export type BulkPriceData = { batchId: string; items: { sku: string; price: number }[] };

/** Viec hang loat: cap nhat gia theo lo (toi da 500 san pham/lo). Gan gia tuyet doi -> ap lai van dung. */
export const bulkPriceTask: TaskDefinition<BulkPriceData> = {
  name: 'bulk-price-update',
  queue: 'bulk',
  parse(d) {
    const data = requireFields<BulkPriceData>(d, ['batchId', 'items']);
    if (!Array.isArray(data.items) || data.items.length > 500) throw new InvalidPayloadError('Lo phai co toi da 500 san pham');
    const bad = data.items.find((i) => !i.sku || !(i.price > 0));
    if (bad) throw new InvalidPayloadError(`Gia khong hop le cho ${bad.sku}`);
    return data;
  },
  idempotencyKey: (d) => `bulk-price:${d.batchId}`,
  async run(d, { ports }) {
    for (const item of d.items) await ports.catalog.setPrice(item.sku, item.price);
    return { updated: d.items.length };
  },
};

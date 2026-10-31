import type { TaskDefinition } from './task.types.js';

export type InventorySyncData = { scheduledAt?: number };

/**
 * Viec dinh ky: lay anh chup ton kho tu ERP va ghi de vao danh muc.
 * Ghi gia tri tuyet doi (khong cong/tru) nen chay lai bao nhieu lan cung ra cung ket qua.
 * Khoa chong lap theo moc lich: hai job cho cung mot moc chi chay mot lan.
 */
export const inventorySyncTask: TaskDefinition<InventorySyncData> = {
  name: 'inventory-sync',
  queue: 'scheduled',
  parse: (d) => (d ?? {}) as InventorySyncData,
  idempotencyKey: (d) => `inventory-sync:${d.scheduledAt ?? 'manual-' + Date.now()}`,
  async run(_d, { ports }) {
    const snapshot = await ports.erp.stockSnapshot();
    await ports.catalog.setStock(snapshot);
    return { skus: Object.keys(snapshot).length };
  },
};

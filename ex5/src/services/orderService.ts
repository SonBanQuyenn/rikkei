import { NOW, orders } from "../data/mockDb.ts";
import { BusinessError } from "./errors.ts";

const HOUR = 3_600_000;

// Don cho xac nhan qua minHours gio ma chua duoc day sang kho
export function listStuckOrders(minHours: number) {
  if (!Number.isFinite(minHours) || minHours < 0 || minHours > 72) {
    throw new BusinessError("minHours phải nằm trong khoảng 0–72 giờ.");
  }
  const stuck = orders.filter(
    (o) => o.status === "CHO_XAC_NHAN" && !o.pushedToWarehouse && NOW.getTime() - o.createdAt.getTime() >= minHours * HOUR,
  );
  return {
    count: stuck.length,
    orders: stuck.map((o) => ({
      orderId: o.orderId,
      warehouse: o.warehouse,
      waitingHours: Math.round(((NOW.getTime() - o.createdAt.getTime()) / HOUR) * 10) / 10,
      total: o.total,
    })),
  };
}

// GHI: day lai don sang kho
export function retryStuckOrders(orderIds: string[]) {
  if (!Array.isArray(orderIds) || orderIds.length === 0) throw new BusinessError("Cần ít nhất 1 mã đơn.");
  if (orderIds.length > 50) throw new BusinessError("Mỗi lần chỉ đẩy lại tối đa 50 đơn.");

  const done: string[] = [];
  const skipped: { orderId: string; reason: string }[] = [];
  for (const id of orderIds) {
    const order = orders.find((o) => o.orderId === id);
    if (!order) skipped.push({ orderId: id, reason: "không tồn tại" });
    else if (order.pushedToWarehouse) skipped.push({ orderId: id, reason: "đã ở kho, không cần đẩy lại" });
    else {
      order.pushedToWarehouse = true;
      order.status = "DANG_CHUAN_BI";
      done.push(id);
    }
  }
  return { retried: done, skipped };
}

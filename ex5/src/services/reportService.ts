// Tong hop so lieu dem qua va tu danh dau bat thuong
import { BASELINE, NIGHT_START, NOW, orders } from "../data/mockDb.ts";
import { getPaymentFailures } from "./paymentService.ts";
import { listStuckOrders } from "./orderService.ts";
import { getStockAlerts } from "./inventoryService.ts";

const STUCK_HOURS = 2;

export function getOvernightSummary(from = NIGHT_START, to = NOW) {
  const nightOrders = orders.filter((o) => o.createdAt >= from && o.createdAt < to);
  const pay = getPaymentFailures(from, to);
  const stuck = listStuckOrders(STUCK_HOURS);
  const stock = getStockAlerts();

  const anomalies: string[] = [];
  if (pay.failureRate > BASELINE.paymentFailureRate * 2) {
    const worst = Object.entries(pay.byGateway).sort((a, b) => b[1].failureRate - a[1].failureRate)[0];
    anomalies.push(
      `Tỷ lệ thanh toán lỗi ${(pay.failureRate * 100).toFixed(1)}% (bình thường ${(BASELINE.paymentFailureRate * 100).toFixed(0)}%), ` +
        `cao nhất ở cổng ${worst[0]} (${(worst[1].failureRate * 100).toFixed(1)}%).`,
    );
  }
  if (stuck.count > 0) anomalies.push(`${stuck.count} đơn chờ xác nhận quá ${STUCK_HOURS} giờ chưa được đẩy sang kho.`);
  if (stock.oversold.length > 0) anomalies.push(`${stock.oversold.length} sản phẩm bị bán vượt tồn kho.`);
  if (stock.outOfStock.length > 0) anomalies.push(`${stock.outOfStock.length} sản phẩm hết hàng nhưng vẫn đang mở bán.`);

  return {
    window: { from: from.toISOString(), to: to.toISOString() },
    orders: { count: nightOrders.length, revenue: nightOrders.reduce((s, o) => s + o.total, 0), baselineCount: BASELINE.ordersPerNight },
    payments: { total: pay.total, failed: pay.failed, failureRate: pay.failureRate, baselineFailureRate: BASELINE.paymentFailureRate },
    stuckOrders: stuck.count,
    stock: { oversold: stock.oversold.length, outOfStockOnSale: stock.outOfStock.length, lowStock: stock.lowStock.length },
    anomalies,
  };
}

/**
 * logger.js - lắng nghe cả 2 sự kiện order:created và order:processed
 * phát ra từ 1 instance của OrderService, in log kèm timestamp.
 *
 * Format: [<ISO timestamp>] Đơn hàng #<id> - <created|processed>
 */
function attachLogger(orderService) {
  orderService.on('order:created', (order) => {
    console.log(`[${new Date().toISOString()}] Đơn hàng #${order.id} - created`);
  });

  orderService.on('order:processed', (order) => {
    console.log(`[${new Date().toISOString()}] Đơn hàng #${order.id} - processed`);
  });
}

module.exports = { attachLogger };

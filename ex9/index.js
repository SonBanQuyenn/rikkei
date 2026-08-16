const config = require('./config');
const OrderService = require('./orderService');
const { attachLogger } = require('./logger');

const orderService = new OrderService();
attachLogger(orderService);

// Lưu lại timestamp thực tế (mili-giây) của các sự kiện để kiểm chứng
const timeline = {}; // { [orderId]: { createdAt, processedAt } }

orderService.on('order:created', (order) => {
  timeline[order.id] = timeline[order.id] || {};
  timeline[order.id].createdAt = Date.now();
});

orderService.on('order:processed', (order) => {
  timeline[order.id].processedAt = Date.now();

  const total = Object.values(timeline);
  const allProcessed = total.length >= 2 && total.every((t) => t.processedAt);

  if (allProcessed) {
    console.log('\n--- Kiểm chứng độ trễ xử lý (so sánh timestamp) ---');
    for (const [id, t] of Object.entries(timeline)) {
      const diff = t.processedAt - t.createdAt;
      console.log(
        `Đơn #${id}: created -> processed mất ${diff}ms ` +
        `(cấu hình PROCESSING_DELAY_MS = ${config.PROCESSING_DELAY_MS}ms) ` +
        `=> ${diff >= config.PROCESSING_DELAY_MS ? 'ĐÚNG (>= delay cấu hình)' : 'SAI'}`
      );
    }
  }
});

console.log(`Cấu hình: PROCESSING_DELAY_MS=${config.PROCESSING_DELAY_MS}, LOG_TIMEZONE=${config.LOG_TIMEZONE}`);
console.log('Tạo 2 đơn hàng liên tiếp...\n');

// Tạo tối thiểu 2 đơn hàng liên tiếp
orderService.createOrder({ id: 1, total: 150000 });
orderService.createOrder({ id: 2, total: 320000 });

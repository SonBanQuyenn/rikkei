import config from './config.js';
import OrderService from './orderService.js';
import { attachLogger } from './logger.js';

const orderService = new OrderService();
attachLogger(orderService);

const timeline = {};

orderService.on('order:created', (order) => {
  timeline[order.id] = timeline[order.id] || {};
  timeline[order.id].createdAt = Date.now();
});

orderService.on('order:processed', (order) => {
  timeline[order.id].processedAt = Date.now();

  const all = Object.values(timeline);
  if (all.length >= 2 && all.every((t) => t.processedAt)) {
    console.log('\n--- Kiểm chứng độ trễ xử lý ---');
    for (const [id, t] of Object.entries(timeline)) {
      const diff = t.processedAt - t.createdAt;
      console.log(`Đơn #${id}: mất ${diff}ms (delay cấu hình: ${config.PROCESSING_DELAY_MS}ms)`);
    }
  }
});

console.log(`[ESM] App version: ${config.APP_VERSION}`);
console.log(`Cấu hình: PROCESSING_DELAY_MS=${config.PROCESSING_DELAY_MS}, LOG_TIMEZONE=${config.LOG_TIMEZONE}`);
console.log('Tạo 2 đơn hàng liên tiếp...\n');

orderService.createOrder({ id: 1, total: 150000 });
orderService.createOrder({ id: 2, total: 320000 });

const EventEmitter = require('events');
const config = require('./config');

/**
 * OrderService - mô phỏng quy trình xử lý đơn hàng bất đồng bộ:
 * 1. createOrder() được gọi -> emit('order:created') NGAY LẬP TỨC
 * 2. Sau khoảng thời gian config.PROCESSING_DELAY_MS (mô phỏng xử lý)
 *    -> emit('order:processed')
 */
class OrderService extends EventEmitter {
  createOrder(order) {
    // (1) emit ngay lập tức
    this.emit('order:created', order);

    // (2) dùng setTimeout với thời gian lấy từ config.PROCESSING_DELAY_MS
    //     để mô phỏng xử lý xong rồi mới emit('order:processed')
    setTimeout(() => {
      this.emit('order:processed', order);
    }, config.PROCESSING_DELAY_MS);
  }
}

module.exports = OrderService;

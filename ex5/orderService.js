const EventEmitter = require('events');

/**
 * OrderService - quản lý đơn hàng, phát sự kiện 'order:created'
 * Kế thừa từ EventEmitter để áp dụng mô hình Pub/Sub.
 */
class OrderService extends EventEmitter {
  constructor() {
    super();

    // Listener chạy MỖI LẦN emit('order:created', ...) được gọi
    this.on('order:created', ({ id, total }) => {
      console.log(`[EMAIL] Đã gửi email xác nhận cho đơn hàng #${id}`);
    });

    // Listener chỉ chạy ĐÚNG 1 LẦN DUY NHẤT, dù emit được gọi bao nhiêu lần
    this.once('order:created', ({ id, total }) => {
      console.log('[SYSTEM] Đơn hàng đầu tiên đã được khởi tạo trong hệ thống');
    });
  }

  /**
   * Tạo đơn hàng mới và phát sự kiện 'order:created'
   * @param {{id: number, total: number}} order
   */
  createOrder(order) {
    this.emit('order:created', order);
  }
}

module.exports = OrderService;

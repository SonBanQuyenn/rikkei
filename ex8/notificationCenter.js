const EventEmitter = require('events');

/**
 * NotificationCenter - quản lý 3 loại sự kiện độc lập:
 * user:registered, order:created, order:cancelled
 * Mỗi sự kiện có đúng 2 listener độc lập (đăng ký riêng biệt bằng .on).
 */
class NotificationCenter extends EventEmitter {
  constructor() {
    super();

    // Bắt buộc lắng nghe sự kiện đặc biệt 'error' của EventEmitter
    // -> nếu không có listener này, khi emit('error', ...) được gọi,
    //    Node.js sẽ ném lỗi và làm crash toàn bộ tiến trình.
    this.on('error', (err) => {
      console.log(`[ERROR-HANDLER] Đã bắt và xử lý lỗi: ${err.message}`);
    });

    // ---------------- user:registered (2 listener độc lập) ----------------
    this.on('user:registered', ({ id, name }) => {
      console.log(`[EMAIL] Gửi email chào mừng tới user #${id} (${name})`);
    });
    this.on('user:registered', ({ id }) => {
      console.log(`[STATS] Cập nhật tổng số người dùng: +1 (user #${id})`);
    });

    // ---------------- order:created (2 listener độc lập) ----------------
    this.on('order:created', ({ id }) => {
      console.log(`[EMAIL] Gửi xác nhận đơn #${id}`);
    });
    this.on('order:created', ({ total }) => {
      console.log(`[STATS] Cập nhật doanh thu: +${total}`);
    });

    // ---------------- order:cancelled (2 listener độc lập) ----------------
    this.on('order:cancelled', ({ id }) => {
      console.log(`[EMAIL] Gửi thông báo huỷ đơn #${id}`);
    });
    // Listener thứ 2: CỐ TÌNH throw lỗi khi total > 1,000,000
    this.on('order:cancelled', ({ id, total }) => {
      if (total > 1000000) {
        throw new Error(
          `Đơn hàng #${id} có giá trị huỷ quá lớn (${total}) - cần nhân viên kiểm tra thủ công`
        );
      }
      console.log(`[STATS] Đã cập nhật lại doanh thu sau khi huỷ đơn #${id}`);
    });
  }

  /**
   * emitSafe: bọc this.emit() trong try/catch.
   * Vì listener có thể throw đồng bộ (synchronous throw), lỗi đó sẽ được
   * ném ngược ra ngay tại lệnh gọi emit(). Ta bắt lại tại đây và chuyển nó
   * thành sự kiện 'error' nội bộ -> chương trình KHÔNG bị crash và vẫn
   * tiếp tục chạy các emit phía sau.
   */
  emitSafe(event, payload) {
    try {
      this.emit(event, payload);
    } catch (err) {
      this.emit('error', err);
    }
  }
}

module.exports = NotificationCenter;

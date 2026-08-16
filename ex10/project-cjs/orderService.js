const EventEmitter = require('events');
const config = require('./config');

class OrderService extends EventEmitter {
  createOrder(order) {
    this.emit('order:created', order);

    setTimeout(() => {
      this.emit('order:processed', order);
    }, config.PROCESSING_DELAY_MS);
  }
}

module.exports = OrderService;

import EventEmitter from 'events';
import config from './config.js';

export default class OrderService extends EventEmitter {
  createOrder(order) {
    this.emit('order:created', order);

    setTimeout(() => {
      this.emit('order:processed', order);
    }, config.PROCESSING_DELAY_MS);
  }
}

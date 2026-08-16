const OrderService = require('./orderService');

const service = new OrderService();

// Tạo tối thiểu 3 đơn hàng mẫu
const orders = [
  { id: 1, total: 100000 },
  { id: 2, total: 250000 },
  { id: 3, total: 75000 },
];

console.log('--- Bắt đầu emit các đơn hàng ---');
orders.forEach((order) => {
  service.emit('order:created', order);
});
console.log('--- Kết thúc ---');

// => Kết quả mong đợi:
// - Dòng [EMAIL] xuất hiện 3 lần (mỗi lần emit)
// - Dòng [SYSTEM] chỉ xuất hiện đúng 1 lần duy nhất (lần emit đầu tiên)

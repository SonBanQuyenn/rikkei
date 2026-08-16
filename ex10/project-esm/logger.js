export function attachLogger(orderService) {
  orderService.on('order:created', (order) => {
    console.log(`[${new Date().toISOString()}] Đơn hàng #${order.id} - created`);
  });

  orderService.on('order:processed', (order) => {
    console.log(`[${new Date().toISOString()}] Đơn hàng #${order.id} - processed`);
  });
}

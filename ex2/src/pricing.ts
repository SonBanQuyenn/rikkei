// Tinh tong tien gio hang (logic thuan, dung cho kiem thu don vi)
export interface CartItem {
  price: number;
  quantity: number;
}

export function calculateTotal(items: CartItem[], discountPercent = 0): number {
  if (discountPercent < 0 || discountPercent > 100) {
    throw new Error('discountPercent phai nam trong khoang 0-100');
  }
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return Math.round(subtotal * (100 - discountPercent)) / 100;
}

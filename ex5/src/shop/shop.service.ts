import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
}

export interface Order {
  id: string;
  userId: string;
  productId: string;
  quantity: number;
}

/** Quy tac nghiep vu flash sale (khong phai la chan): moi tai khoan toi da 2 san pham / mat hang. */
export const MAX_UNITS_PER_ACCOUNT = 2;

@Injectable()
export class ShopService {
  private products = new Map<string, Product>([['FS-IPHONE', { id: 'FS-IPHONE', name: 'Dien thoai flash sale 11/11', price: 1_111_000, stock: 100 }]]);
  private orders: Order[] = [];

  getProduct(id: string) {
    const product = this.products.get(id);
    if (!product) throw new NotFoundException(`Khong co san pham ${id}`);
    return product;
  }

  placeOrder(userId: string | undefined, productId: string, rawQuantity: unknown): Order {
    if (!userId) throw new UnauthorizedException('Vui lòng đăng nhập để đặt hàng (header X-User-Id).');
    const quantity = rawQuantity === undefined ? 1 : Number(rawQuantity);
    if (!Number.isInteger(quantity) || quantity < 1) throw new BadRequestException('Số lượng phải là số nguyên dương.');

    const product = this.getProduct(productId);
    const bought = this.orders.filter((o) => o.userId === userId && o.productId === productId).reduce((n, o) => n + o.quantity, 0);
    if (bought + quantity > MAX_UNITS_PER_ACCOUNT) {
      throw new ConflictException(`Mỗi tài khoản chỉ được mua tối đa ${MAX_UNITS_PER_ACCOUNT} sản phẩm này (đã mua ${bought}).`);
    }
    if (product.stock < quantity) throw new ConflictException('Sản phẩm đã hết hàng.');

    product.stock -= quantity;
    const order: Order = { id: `DH-${this.orders.length + 1}`, userId, productId, quantity };
    this.orders.push(order);
    return order;
  }

  listOrders() {
    return this.orders;
  }
}

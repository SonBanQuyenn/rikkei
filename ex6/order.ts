enum OrderStatus {
    PENDING = "Pending",
    SHIPPED = "Shipped",
    DELIVERED = "Delivered"
}

class Order {
    id: number;
    status: OrderStatus;

    constructor(id: number, status: OrderStatus) {
        this.id = id;
        this.status = status;
    }

    checkStatus(): void {
        if (this.status === OrderStatus.DELIVERED) {
            console.log(`Đơn hàng #${this.id}: Order finished`);
        } else {
            console.log(`Đơn hàng #${this.id}: Trạng thái hiện tại là ${this.status}`);
        }
    }
}

const order1 = new Order(1, OrderStatus.PENDING);
const order2 = new Order(2, OrderStatus.SHIPPED);
const order3 = new Order(3, OrderStatus.DELIVERED);

order1.checkStatus();
order2.checkStatus();
order3.checkStatus();
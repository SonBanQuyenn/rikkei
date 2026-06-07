"use strict";
var OrderStatus;
(function (OrderStatus) {
    OrderStatus["PENDING"] = "Pending";
    OrderStatus["SHIPPED"] = "Shipped";
    OrderStatus["DELIVERED"] = "Delivered";
})(OrderStatus || (OrderStatus = {}));
class Order {
    id;
    status;
    constructor(id, status) {
        this.id = id;
        this.status = status;
    }
    checkStatus() {
        if (this.status === OrderStatus.DELIVERED) {
            console.log(`Đơn hàng #${this.id}: Order finished`);
        }
        else {
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

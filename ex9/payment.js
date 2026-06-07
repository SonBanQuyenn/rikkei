"use strict";
class PaymentMethod {
    amount;
    constructor(amount) {
        this.amount = amount;
    }
    showAmount() {
        console.log(`Số tiền cần thanh toán: ${this.amount} VNĐ`);
    }
}
class CreditCardPayment extends PaymentMethod {
    cardNumber;
    cardHolder;
    constructor(amount, cardNumber, cardHolder) {
        super(amount);
        this.cardNumber = cardNumber;
        this.cardHolder = cardHolder;
    }
    processPayment() {
        console.log(`   Chủ thẻ: ${this.cardHolder}`);
        console.log(`   Số thẻ: **** **** **** ${this.cardNumber.slice(-4)}`);
        console.log(`   Số tiền: ${this.amount} VNĐ`);
        console.log(`   Thanh toán bằng thẻ tín dụng thành công!`);
    }
}
class PaypalPayment extends PaymentMethod {
    email;
    constructor(amount, email) {
        super(amount);
        this.email = email;
    }
    processPayment() {
        console.log(`   Email: ${this.email}`);
        console.log(`   Số tiền: ${this.amount} VNĐ`);
        console.log(`   Thanh toán qua PayPal thành công!`);
    }
}
const creditCard = new CreditCardPayment(500000, "1234 5678 9012 3456", "Nguyen Van A");
const paypal = new PaypalPayment(300000, "user@example.com");
console.log("=== THANH TOÁN QUA THẺ TÍN DỤNG ===");
creditCard.showAmount();
creditCard.processPayment();
console.log("\n=== THANH TOÁN QUA PAYPAL ===");
paypal.showAmount();
paypal.processPayment();

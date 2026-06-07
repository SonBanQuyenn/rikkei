abstract class PaymentMethod {
    protected amount: number;

    constructor(amount: number) {
        this.amount = amount;
    }

    abstract processPayment(): void;

    showAmount(): void {
        console.log(`Số tiền cần thanh toán: ${this.amount} VNĐ`);
    }
}

class CreditCardPayment extends PaymentMethod {
    private cardNumber: string;
    private cardHolder: string;

    constructor(amount: number, cardNumber: string, cardHolder: string) {
        super(amount);
        this.cardNumber = cardNumber;
        this.cardHolder = cardHolder;
    }

    processPayment(): void {
        console.log(`   Chủ thẻ: ${this.cardHolder}`);
        console.log(`   Số thẻ: **** **** **** ${this.cardNumber.slice(-4)}`);
        console.log(`   Số tiền: ${this.amount} VNĐ`);
        console.log(`   Thanh toán bằng thẻ tín dụng thành công!`);
    }
}

class PaypalPayment extends PaymentMethod {
    private email: string;

    constructor(amount: number, email: string) {
        super(amount);
        this.email = email;
    }

    processPayment(): void {
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
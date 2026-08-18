const mongoose = require('mongoose');
const Product = require('../models/Product');
const Order = require('../models/Order');

const MONGODB_URI = 'mongodb://localhost:27017/ecommerce_db';

const products = [
    { name: 'Laptop Dell XPS 13', price: 25000, category: 'Laptop', stock: 10 },
    { name: 'Laptop MacBook Pro', price: 35000, category: 'Laptop', stock: 5 },
    { name: 'iPhone 15 Pro Max', price: 30000, category: 'Mobile', stock: 15 },
    { name: 'Samsung Galaxy S24', price: 28000, category: 'Mobile', stock: 12 },
    { name: 'Xiaomi 14 Pro', price: 12000, category: 'Mobile', stock: 20 },
    { name: 'Tai nghe Sony WH-1000XM5', price: 8000, category: 'Phụ kiện', stock: 25 }
];

async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Kết nối MongoDB thành công!\n');
    } catch (error) {
        console.error('Kết nối MongoDB thất bại:', error.message);
        process.exit(1);
    }
}

async function seedData() {
    try {
        await Product.deleteMany({});
        await Order.deleteMany({});
        console.log('Đã xóa dữ liệu cũ\n');

        const insertedProducts = await Product.insertMany(products);
        console.log(`Đã thêm ${insertedProducts.length} sản phẩm\n`);

        const orders = [
            {
                orderNumber: 'ORD001',
                product_id: insertedProducts[0]._id,
                quantity: 2,
                totalPrice: 50000,
                customerName: 'Nguyễn Văn A',
                customerPhone: '0987654321',
                customerAddress: '123 Nguyễn Trãi, Quận 1, TP.HCM'
            },
            {
                orderNumber: 'ORD002',
                product_id: insertedProducts[2]._id,
                quantity: 1,
                totalPrice: 30000,
                status: 'shipped',
                customerName: 'Trần Thị B',
                customerPhone: '0912345678',
                customerAddress: '456 Lê Lợi, Quận 1, TP.HCM'
            },
            {
                orderNumber: 'ORD003',
                product_id: insertedProducts[1]._id,
                quantity: 3,
                totalPrice: 105000,
                status: 'delivered',
                customerName: 'Lê Văn C',
                customerPhone: '0923456789',
                customerAddress: '789 Trần Hưng Đạo, Quận 5, TP.HCM'
            },
            {
                orderNumber: 'ORD004',
                product_id: insertedProducts[3]._id,
                quantity: 2,
                totalPrice: 56000,
                status: 'pending',
                customerName: 'Phạm Thị D',
                customerPhone: '0934567890',
                customerAddress: '321 Nguyễn Huệ, Quận 1, TP.HCM'
            },
            {
                orderNumber: 'ORD005',
                product_id: insertedProducts[4]._id,
                quantity: 5,
                totalPrice: 60000,
                status: 'processing',
                customerName: 'Hoàng Văn E',
                customerPhone: '0945678901',
                customerAddress: '654 Lý Tự Trọng, Quận 3, TP.HCM'
            }
        ];

        const insertedOrders = await Order.insertMany(orders);
        console.log(`Đã thêm ${insertedOrders.length} đơn hàng\n`);

        console.log('--- DANH SÁCH ĐƠN HÀNG (CHƯA POPULATE) ---');
        insertedOrders.forEach(order => {
            console.log(`- ${order.orderNumber} | Product ID: ${order.product_id} | ${order.quantity} sp | ${order.totalPrice}đ`);
        });
        console.log('');

    } catch (error) {
        console.error('Lỗi seed:', error.message);
    } finally {
        await mongoose.disconnect();
        console.log('Đã ngắt kết nối MongoDB');
    }
}

async function main() {
    await connectDB();
    await seedData();
}

main();
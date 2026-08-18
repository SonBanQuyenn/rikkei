const mongoose = require('mongoose');
const Order = require('./models/Order');
const Product = require('./models/Product');

const MONGODB_URI = 'mongodb://localhost:27017/ecommerce_db';

async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Kết nối MongoDB thành công!\n');
    } catch (error) {
        console.error('Kết nối MongoDB thất bại:', error.message);
        process.exit(1);
    }
}

async function getOrderWithoutPopulate(orderId) {
    console.log('--- LẤY ĐƠN HÀNG KHÔNG POPULATE ---');
    const order = await Order.findById(orderId);
    if (order) {
        console.log(`Mã đơn: ${order.orderNumber}`);
        console.log(`Product ID: ${order.product_id} (chỉ là ObjectId)`);
        console.log(`Số lượng: ${order.quantity}`);
        console.log(`Tổng tiền: ${order.totalPrice}đ`);
        console.log(`Khách hàng: ${order.customerName}`);
        console.log(`Trạng thái: ${order.status}\n`);
    }
    return order;
}

async function getOrderWithPopulate(orderId) {
    console.log('--- LẤY ĐƠN HÀNG CÓ POPULATE ---');
    const order = await Order.findById(orderId).populate('product_id');
    if (order) {
        console.log(`Mã đơn: ${order.orderNumber}`);
        console.log(`Sản phẩm: ${order.product_id.name}`);
        console.log(`Danh mục: ${order.product_id.category}`);
        console.log(`Giá sản phẩm: ${order.product_id.price}đ`);
        console.log(`Số lượng: ${order.quantity}`);
        console.log(`Tổng tiền: ${order.totalPrice}đ`);
        console.log(`Khách hàng: ${order.customerName}`);
        console.log(`SĐT: ${order.customerPhone}`);
        console.log(`Địa chỉ: ${order.customerAddress}`);
        console.log(`Trạng thái: ${order.status}`);
        console.log(`Tạo lúc: ${order.createdAt}\n`);
    }
    return order;
}

async function getAllOrdersWithPopulate() {
    console.log('=== LẤY TẤT CẢ ĐƠN HÀNG CÓ POPULATE ===\n');
    const orders = await Order.find().populate('product_id');

    orders.forEach((order, index) => {
        console.log(`${index + 1}. Đơn hàng: ${order.orderNumber}`);
        console.log(`   Sản phẩm: ${order.product_id.name} (${order.product_id.category})`);
        console.log(`   Giá: ${order.product_id.price}đ x ${order.quantity} = ${order.totalPrice}đ`);
        console.log(`   Khách hàng: ${order.customerName}`);
        console.log(`   Trạng thái: ${order.status}`);
        console.log(`   Địa chỉ: ${order.customerAddress}\n`);
    });

    return orders;
}

async function getOrdersByProduct(productName) {
    console.log(`=== LẤY ĐƠN HÀNG THEO SẢN PHẨM: ${productName} ===\n`);

    const product = await Product.findOne({ name: productName });
    if (!product) {
        console.log(`Không tìm thấy sản phẩm: ${productName}\n`);
        return [];
    }

    const orders = await Order.find({ product_id: product._id }).populate('product_id');

    if (orders.length === 0) {
        console.log(`Không có đơn hàng nào cho sản phẩm: ${productName}\n`);
        return [];
    }

    orders.forEach((order, index) => {
        console.log(`${index + 1}. ${order.orderNumber} | ${order.customerName} | ${order.quantity} sp | ${order.status}`);
    });
    console.log(`\nTổng số đơn hàng: ${orders.length}\n`);

    return orders;
}

async function getOrderStats() {
    console.log('=== THỐNG KÊ ĐƠN HÀNG ===\n');

    const orders = await Order.find().populate('product_id');

    const totalOrders = orders.length;
    const totalRevenue = orders.reduce((sum, order) => sum + order.totalPrice, 0);
    const statusCounts = {};
    const categoryCounts = {};

    orders.forEach(order => {
        // Thống kê theo trạng thái
        statusCounts[order.status] = (statusCounts[order.status] || 0) + 1;

        // Thống kê theo danh mục sản phẩm
        if (order.product_id && order.product_id.category) {
            const category = order.product_id.category;
            categoryCounts[category] = (categoryCounts[category] || 0) + 1;
        }
    });

    console.log(`Tổng số đơn hàng: ${totalOrders}`);
    console.log(`Tổng doanh thu: ${totalRevenue}đ`);
    console.log('\nThống kê theo trạng thái:');
    for (const [status, count] of Object.entries(statusCounts)) {
        console.log(`  - ${status}: ${count} đơn`);
    }
    console.log('\nThống kê theo danh mục:');
    for (const [category, count] of Object.entries(categoryCounts)) {
        console.log(`  - ${category}: ${count} đơn`);
    }
    console.log('');
}

async function main() {
    await connectDB();

    // Lấy một đơn hàng bất kỳ (ví dụ ORD001)
    const sampleOrder = await Order.findOne({ orderNumber: 'ORD001' });
    if (sampleOrder) {
        await getOrderWithoutPopulate(sampleOrder._id);
        await getOrderWithPopulate(sampleOrder._id);
    }

    await getAllOrdersWithPopulate();
    await getOrdersByProduct('iPhone 15 Pro Max');
    await getOrderStats();

    await mongoose.disconnect();
    console.log('Đã ngắt kết nối MongoDB');
}

main();
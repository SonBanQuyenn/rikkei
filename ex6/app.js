const mongoose = require('mongoose');
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

async function testValidProduct() {
    console.log('--- TEST 1: LƯU SẢN PHẨM HỢP LỆ ---');
    try {
        const validProduct = new Product({
            name: 'Sách Clean Code',
            price: 150000,
            category: 'Sách'
        });

        const savedProduct = await validProduct.save();
        console.log('=> Lưu THÀNH CÔNG sản phẩm hợp lệ:');
        console.log(`ID: ${savedProduct._id}`);
        console.log(`Tạo lúc: ${savedProduct.createdAt}`);
        console.log('');
    } catch (error) {
        console.error('Lỗi khi lưu sản phẩm hợp lệ:', error.message);
        console.log('');
    }
}

async function testInvalidProduct() {
    console.log('--- TEST 2: LƯU SẢN PHẨM VI PHẠM VALIDATION ---');
    try {
        const invalidProduct = new Product({
            name: 'ABC',
            price: -10000,
            category: ''
        });

        console.log('=> Đang cố gắng lưu sản phẩm lỗi vào DB...\n');
        await invalidProduct.save();
    } catch (error) {
        console.log('[!] BẮT ĐƯỢC LỖI VALIDATION:');

        if (error.name === 'ValidationError') {
            for (const field in error.errors) {
                console.log(`- Lỗi ở trường '${field}': ${error.errors[field].message}`);
            }
        } else {
            console.log(`Lỗi: ${error.message}`);
        }
        console.log('');
    }
}

async function main() {
    await connectDB();
    await testValidProduct();
    await testInvalidProduct();

    await mongoose.disconnect();
    console.log('Đã ngắt kết nối MongoDB');
}

main();
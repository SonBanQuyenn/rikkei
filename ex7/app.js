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

async function queryProducts() {
    console.log('=== TRUY VẤN SẢN PHẨM ===\n');
    console.log('Điều kiện:');
    console.log('  - Thuộc danh mục "Laptop" HOẶC "Mobile"');
    console.log('  - VÀ có giá bán nhỏ hơn 20.000\n');

    console.log('--- Cách 1: Sử dụng $or ---');
    const result1 = await Product.find({
        $or: [
            { category: 'Laptop' },
            { category: 'Mobile' }
        ],
        price: { $lt: 20000 }
    });
    console.log(`Tìm thấy ${result1.length} sản phẩm:\n`);
    result1.forEach(p => {
        console.log(`- ${p.name} | ${p.category} | ${p.price}đ`);
    });
    console.log('');

    console.log('--- Cách 2: Sử dụng $in ---');
    const result2 = await Product.find({
        category: { $in: ['Laptop', 'Mobile'] },
        price: { $lt: 20000 }
    });
    console.log(`Tìm thấy ${result2.length} sản phẩm:\n`);
    result2.forEach(p => {
        console.log(`- ${p.name} | ${p.category} | ${p.price}đ`);
    });
    console.log('');

    console.log('--- Cách 3: Sử dụng Query Builder ---');
    const result3 = await Product.find()
        .where('category')
        .in(['Laptop', 'Mobile'])
        .where('price')
        .lt(20000);
    console.log(`Tìm thấy ${result3.length} sản phẩm:\n`);
    result3.forEach(p => {
        console.log(`- ${p.name} | ${p.category} | ${p.price}đ`);
    });
}

async function main() {
    await connectDB();
    await queryProducts();
    await mongoose.disconnect();
    console.log('\nĐã ngắt kết nối MongoDB');
}

main();
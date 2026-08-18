const mongoose = require('mongoose');
const Product = require('../models/Product');

const MONGODB_URI = 'mongodb://localhost:27017/ecommerce_db';

const products = [
    { name: 'Laptop Dell XPS 13', price: 25000, category: 'Laptop', stock: 10 },
    { name: 'Laptop MacBook Pro', price: 35000, category: 'Laptop', stock: 5 },
    { name: 'Laptop HP Spectre', price: 18000, category: 'Laptop', stock: 8 },
    { name: 'Laptop Lenovo ThinkPad', price: 15000, category: 'Laptop', stock: 12 },
    { name: 'Laptop Asus ZenBook', price: 22000, category: 'Laptop', stock: 6 },
    { name: 'iPhone 15 Pro Max', price: 30000, category: 'Mobile', stock: 15 },
    { name: 'Samsung Galaxy S24', price: 28000, category: 'Mobile', stock: 12 },
    { name: 'Xiaomi 14 Pro', price: 12000, category: 'Mobile', stock: 20 },
    { name: 'Oppo Find X7', price: 16000, category: 'Mobile', stock: 10 },
    { name: 'Vivo X100 Pro', price: 19000, category: 'Mobile', stock: 8 },
    { name: 'Tai nghe Sony WH-1000XM5', price: 8000, category: 'Phụ kiện', stock: 25 },
    { name: 'Chuột Logitech MX Master', price: 3000, category: 'Phụ kiện', stock: 30 },
    { name: 'Bàn phím cơ Keychron', price: 4000, category: 'Phụ kiện', stock: 18 },
    { name: 'Màn hình Dell UltraSharp', price: 15000, category: 'Phụ kiện', stock: 5 },
    { name: 'Ổ cứng SSD Samsung T7', price: 5000, category: 'Phụ kiện', stock: 15 }
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
        console.log('Đã xóa dữ liệu cũ');

        const inserted = await Product.insertMany(products);
        console.log(`Đã thêm ${inserted.length} sản phẩm vào database\n`);

        console.log('--- DANH SÁCH SẢN PHẨM ĐÃ THÊM ---');
        inserted.forEach(p => {
            console.log(`- ${p.name} | ${p.category} | ${p.price}đ | Tồn kho: ${p.stock}`);
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
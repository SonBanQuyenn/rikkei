const mongoose = require('mongoose');
const Product = require('../models/Product');

const seedData = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/product_demo');

        await Product.deleteMany({});

        const products = [
            {
                name: 'Laptop Dell XPS',
                price: 10000,
                category: 'Laptop'
            },
            {
                name: 'iPhone 12 Pro',
                price: 15000,
                category: 'Mobile'
            },
            {
                name: 'Samsung Galaxy S21',
                price: 12000,
                category: 'Mobile'
            },
            {
                name: 'MacBook Pro M1',
                price: 20000,
                category: 'Laptop'
            },
            {
                name: 'iPad Air',
                price: 8000,
                category: 'Tablet'
            }
        ];

        await Product.insertMany(products);

        console.log('✓ Đã seed dữ liệu thành công!');
        console.log(`  - ${products.length} sản phẩm đã được tạo`);
        console.log('  - Lưu ý: Các sản phẩm chưa có trường stock');

        const allProducts = await Product.find({});
        console.log('\nDanh sách sản phẩm:');
        allProducts.forEach((p, index) => {
            console.log(`  ${index + 1}. ${p.name} - ${p.price} - ${p.category}`);
            console.log(`     Stock: ${p.stock !== undefined ? p.stock : 'Không có'}`);
        });

    } catch (error) {
        console.error('Lỗi seed:', error);
    } finally {
        await mongoose.connection.close();
    }
};

seedData();
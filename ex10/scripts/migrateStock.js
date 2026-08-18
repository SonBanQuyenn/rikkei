const mongoose = require('mongoose');
const Product = require('../models/Product');

const migrateStock = async () => {
    try {
        console.log('=== BẮT ĐẦU MIGRATION ===\n');

        await mongoose.connect('mongodb://localhost:27017/product_demo');

        console.log('1. Kiểm tra sản phẩm chưa có trường stock:');

        const missingStockProducts = await Product.find({
            stock: { $exists: false }
        });

        console.log(`   Tìm thấy ${missingStockProducts.length} sản phẩm chưa có stock:\n`);

        missingStockProducts.forEach((product, index) => {
            console.log(`   [${index + 1}] Sản phẩm chưa có stock:`);
            console.log(`       ID: ${product._id}`);
            console.log(`       Name: ${product.name}`);
            console.log(`       Price: ${product.price}`);
            console.log(`       Category: ${product.category}`);
            console.log(`       Stock: ${product.stock !== undefined ? product.stock : 'KHÔNG CÓ'}`);
            console.log('');
        });

        if (missingStockProducts.length === 0) {
            console.log('✓ Không có sản phẩm nào cần cập nhật!');
            return;
        }

        console.log('2. Cập nhật stock = 10 cho tất cả sản phẩm chưa có stock:');

        const result = await Product.updateMany(
            { stock: { $exists: false } },
            { $set: { stock: 10 } }
        );

        console.log(`   ✓ Đã cập nhật ${result.modifiedCount} sản phẩm`);

        console.log('\n3. Kiểm tra kết quả sau khi cập nhật:');

        const updatedProducts = await Product.find({
            stock: { $exists: true }
        });

        console.log(`   Tổng số sản phẩm đã có stock: ${updatedProducts.length}`);

        const allProducts = await Product.find({});
        console.log('\n   Danh sách tất cả sản phẩm sau migration:');
        allProducts.forEach((product, index) => {
            console.log(`   [${index + 1}] ${product.name}`);
            console.log(`       Stock: ${product.stock}`);
        });

        console.log('\n=== HOÀN THÀNH MIGRATION ===');

    } catch (error) {
        console.error('Lỗi migration:', error);
    } finally {
        await mongoose.connection.close();
    }
};

migrateStock();
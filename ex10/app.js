const express = require('express');
const mongoose = require('mongoose');
const Product = require('./models/Product');

const app = express();
const PORT = 3000;

app.use(express.json());

mongoose.connect('mongodb://localhost:27017/product_demo')
    .then(() => {
        console.log('✓ Kết nối MongoDB thành công');
    })
    .catch((error) => {
        console.error('Lỗi kết nối MongoDB:', error);
    });

app.get('/products', async (req, res) => {
    try {
        const products = await Product.find({});
        res.json({
            success: true,
            data: products,
            total: products.length
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.get('/products/missing-stock', async (req, res) => {
    try {
        const products = await Product.find({
            stock: { $exists: false }
        });
        res.json({
            success: true,
            data: products,
            total: products.length,
            message: 'Sản phẩm chưa có trường stock'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.post('/products/migrate-stock', async (req, res) => {
    try {
        const missingStockProducts = await Product.find({
            stock: { $exists: false }
        });

        if (missingStockProducts.length === 0) {
            return res.json({
                success: true,
                message: 'Không có sản phẩm nào cần cập nhật',
                updatedCount: 0
            });
        }

        const result = await Product.updateMany(
            { stock: { $exists: false } },
            { $set: { stock: 10 } }
        );

        const updatedProducts = await Product.find({
            stock: { $exists: true }
        });

        res.json({
            success: true,
            message: 'Migration thành công',
            updatedCount: result.modifiedCount,
            totalProductsWithStock: updatedProducts.length,
            data: updatedProducts
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
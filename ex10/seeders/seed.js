const { sequelize, Category, Product } = require('../models');

const seedData = async () => {
    try {
        await sequelize.sync({ force: true });

        console.log('=== BẮT ĐẦU SEED DỮ LIỆU ===\n');

        const categories = [];
        for (let i = 1; i <= 50; i++) {
            const category = await Category.create({
                name: `Category ${i}`
            });
            categories.push(category);

            const products = [];
            for (let j = 1; j <= 10; j++) {
                products.push({
                    name: `Product ${i}-${j}`,
                    price: Math.floor(Math.random() * 900000) + 100000,
                    categoryId: category.id
                });
            }
            await Product.bulkCreate(products);

            if (i % 10 === 0) {
                console.log(`✓ Đã tạo ${i} categories và ${i * 10} products`);
            }
        }

        console.log('\n✓ Hoàn thành seed dữ liệu:');
        console.log(`  - 50 categories`);
        console.log(`  - 500 products`);
        console.log('\n=== HOÀN THÀNH SEED ===');

    } catch (error) {
        console.error('Lỗi seed:', error);
    } finally {
        await sequelize.close();
    }
};

seedData();
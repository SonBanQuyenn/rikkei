const { Category, Product } = require('../models');
const { incrementQueryCount } = require('../middlewares/queryCounter');

const getSlowReport = async (req, res, next) => {
    try {
        const categories = await Category.findAll();
        incrementQueryCount();

        const result = [];
        for (const category of categories) {
            const products = await Product.findAll({
                where: { categoryId: category.id }
            });
            incrementQueryCount();

            result.push({
                id: category.id,
                name: category.name,
                products: products.map(p => ({
                    id: p.id,
                    name: p.name,
                    price: p.price
                }))
            });
        }

        res.json({
            success: true,
            data: result,
            meta: {}
        });
    } catch (error) {
        next(error);
    }
};

const getFastReport = async (req, res, next) => {
    try {
        const categories = await Category.findAll({
            include: [{
                model: Product,
                as: 'products',
                attributes: ['id', 'name', 'price']
            }]
        });
        incrementQueryCount();

        const result = categories.map(category => ({
            id: category.id,
            name: category.name,
            products: category.products.map(p => ({
                id: p.id,
                name: p.name,
                price: p.price
            }))
        }));

        res.json({
            success: true,
            data: result,
            meta: {}
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getSlowReport,
    getFastReport
};
const Product = require('../models/Product');
const AppError = require('../utils/AppError');

const getProducts = (req, res, next) => {
    try {
        let page = parseInt(req.query.page) || 1;
        let limit = parseInt(req.query.limit) || 10;
        const keyword = req.query.keyword || null;
        const sort = req.query.sort || 'id_desc';
        
        if (page < 1) {
            page = 1;
        }
        
        if (limit < 1) {
            limit = 10;
        }
        
        if (limit > 50) {
            limit = 50;
        }
        
        const result = Product.findAndCountAll({
            page,
            limit,
            keyword,
            sort
        });
        
        const totalPages = Math.ceil(result.count / limit);
        
        res.json({
            success: true,
            data: result.rows,
            meta: {
                page: page,
                limit: limit,
                total: result.count,
                totalPages: totalPages
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getProducts
};
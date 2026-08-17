const Order = require('../models/Order');
const AppError = require('../utils/AppError');

const getOrdersByUser = (req, res, next) => {
    try {
        const userId = parseInt(req.params.userId);
        const status = req.query.status;
        const limit = req.query.limit ? parseInt(req.query.limit) : 5;

        const userExists = Order.getUserById(userId);
        if (!userExists) {
            throw new AppError('User not found', 404, 'USER_NOT_FOUND');
        }

        const result = Order.getOrdersByUserId(userId, status, limit);

        res.json({
            success: true,
            data: result.data,
            meta: {
                total: result.total
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getOrdersByUser
};
const Order = require('../models/Order');
const AppError = require('../utils/AppError');
const generateLinks = require('../utils/links');

const getOrderById = (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const order = Order.findById(id);

        if (!order) {
            throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
        }

        const user = Order.findUserById(order.userId);
        const links = generateLinks(order.id, order.userId, order.status);

        res.json({
            data: {
                id: order.id,
                userId: order.userId,
                status: order.status,
                total: order.total,
                customer: user ? user.name : 'Unknown'
            },
            _links: links
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getOrderById
};
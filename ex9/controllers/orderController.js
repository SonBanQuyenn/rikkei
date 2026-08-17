const { sequelize, Product, Order, OrderItem } = require('../models');
const AppError = require('../utils/AppError');

const createOrder = async (req, res, next) => {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
        return next(new AppError('Danh sách sản phẩm không hợp lệ', 400));
    }

    const transaction = await sequelize.transaction();

    try {
        const productIds = items.map(item => item.productId);
        const products = await Product.findAll({
            where: {
                id: productIds
            },
            transaction
        });

        const productMap = {};
        products.forEach(product => {
            productMap[product.id] = product;
        });

        let total = 0;
        const orderItems = [];

        for (const item of items) {
            const product = productMap[item.productId];
            
            if (!product) {
                throw new AppError(`Sản phẩm ID ${item.productId} không tồn tại`, 404);
            }

            if (product.stock < item.qty) {
                throw new AppError(`Sản phẩm "${product.name}" không đủ tồn kho (còn ${product.stock})`, 409);
            }

            total += product.price * item.qty;
            orderItems.push({
                productId: product.id,
                quantity: item.qty,
                price: product.price
            });
        }

        const order = await Order.create({
            total: total,
            status: 'pending'
        }, { transaction });

        const orderItemsWithOrderId = orderItems.map(item => ({
            ...item,
            orderId: order.id
        }));

        await OrderItem.bulkCreate(orderItemsWithOrderId, { transaction });

        for (const item of items) {
            const product = productMap[item.productId];
            await product.decrement('stock', {
                by: item.qty,
                transaction
            });
        }

        await transaction.commit();

        const orderWithItems = await Order.findByPk(order.id, {
            include: [
                {
                    model: OrderItem,
                    include: [Product]
                }
            ]
        });

        res.status(201).json({
            success: true,
            message: 'Đặt hàng thành công',
            data: orderWithItems
        });

    } catch (error) {
        await transaction.rollback();
        next(error);
    }
};

const getOrders = async (req, res, next) => {
    try {
        const orders = await Order.findAll({
            include: [
                {
                    model: OrderItem,
                    include: [Product]
                }
            ],
            order: [['createdAt', 'DESC']]
        });

        res.json({
            success: true,
            data: orders
        });
    } catch (error) {
        next(error);
    }
};

const getProducts = async (req, res, next) => {
    try {
        const products = await Product.findAll({
            order: [['id', 'ASC']]
        });

        res.json({
            success: true,
            data: products
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createOrder,
    getOrders,
    getProducts
};
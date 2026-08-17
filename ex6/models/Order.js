const orders = require('../data/orders');

const getOrdersByUserId = (userId, status, limit) => {
    let filteredOrders = orders.filter(order => order.userId === userId);

    if (status) {
        filteredOrders = filteredOrders.filter(order => order.status === status);
    }

    const total = filteredOrders.length;

    if (limit) {
        filteredOrders = filteredOrders.slice(0, limit);
    }

    return {
        data: filteredOrders,
        total: total
    };
};

const getUserById = (userId) => {
    const users = [1, 2, 3];
    return users.includes(userId);
};

module.exports = {
    getOrdersByUserId,
    getUserById
};
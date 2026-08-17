const orders = [
    { id: 1, userId: 1, status: 'pending', total: 150000 },
    { id: 2, userId: 2, status: 'paid', total: 300000 },
    { id: 3, userId: 1, status: 'cancelled', total: 50000 },
    { id: 4, userId: 3, status: 'pending', total: 200000 },
    { id: 5, userId: 2, status: 'paid', total: 450000 }
];

const users = [
    { id: 1, name: 'Nguyen Van A' },
    { id: 2, name: 'Tran Thi B' },
    { id: 3, name: 'Le Van C' }
];

module.exports = { orders, users };
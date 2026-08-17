const orders = [
    { id: 1, userId: 1, status: 'paid', total: 150000 },
    { id: 2, userId: 1, status: 'pending', total: 200000 },
    { id: 3, userId: 1, status: 'cancelled', total: 50000 },
    { id: 4, userId: 2, status: 'paid', total: 300000 },
    { id: 5, userId: 2, status: 'paid', total: 450000 },
    { id: 6, userId: 2, status: 'pending', total: 100000 },
    { id: 7, userId: 2, status: 'cancelled', total: 75000 },
    { id: 8, userId: 3, status: 'pending', total: 120000 },
    { id: 9, userId: 3, status: 'paid', total: 600000 },
    { id: 10, userId: 3, status: 'cancelled', total: 250000 }
];

module.exports = orders;
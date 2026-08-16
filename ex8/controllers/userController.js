const AppError = require('../utils/AppError');

let users = [
    { id: 1, name: 'John', email: 'john@example.com' },
    { id: 2, name: 'Jane', email: 'jane@example.com' },
    { id: 3, name: 'Bob', email: 'bob@example.com' }
];

const getUserById = (req, res, next) => {
    const id = parseInt(req.params.id);
    const user = users.find(u => u.id === id);

    if (!user) {
        return next(new AppError('Không tìm thấy user', 404));
    }

    res.json({
        success: true,
        data: user
    });
};

const createUser = (req, res, next) => {
    const { email } = req.body;

    if (!email) {
        return next(new AppError('Thiếu trường email', 400));
    }

    const newUser = {
        id: users.length + 1,
        name: req.body.name || 'Unknown',
        email: email
    };
    users.push(newUser);

    res.status(201).json({
        success: true,
        data: newUser
    });
};

const getSecret = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return next(new AppError('Chưa xác thực', 401));
    }

    res.json({
        success: true,
        message: 'Bạn đã truy cập được secret route!',
        data: { secret: 'This is a secret message' }
    });
};

module.exports = {
    getUserById,
    createUser,
    getSecret
};
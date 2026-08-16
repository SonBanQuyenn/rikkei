const AppError = require('../utils/AppError');

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
        return next(new AppError('Chưa đăng nhập', 401));
    }

    req.user = {
        id: 1,
        role: authHeader
    };

    next();
};

const authorize = (role) => {
    return (req, res, next) => {
        if (req.user.role !== role) {
            return next(new AppError('Không đủ quyền truy cập', 403));
        }
        next();
    };
};

module.exports = {
    authenticate,
    authorize
};
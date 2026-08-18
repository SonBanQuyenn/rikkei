const jwt = require('jsonwebtoken');
const { config } = require('../config');

const generateAccessToken = (payload) => {
    return jwt.sign(payload, config.jwt.accessSecret, {
        expiresIn: config.jwt.accessExpiresIn
    });
};

const generateRefreshToken = (payload) => {
    return jwt.sign(payload, config.jwt.refreshSecret, {
        expiresIn: config.jwt.refreshExpiresIn
    });
};

const verifyAccessToken = (token) => {
    try {
        return jwt.verify(token, config.jwt.accessSecret);
    } catch (error) {
        return null;
    }
};

const verifyRefreshToken = (token) => {
    try {
        return jwt.verify(token, config.jwt.refreshSecret);
    } catch (error) {
        return null;
    }
};

const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'No token provided'
        });
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyAccessToken(token);

    if (!decoded) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }

    req.user = decoded;
    next();
};

const authorize = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                message: 'Unauthorized'
            });
        }

        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Forbidden - Insufficient permissions'
            });
        }

        next();
    };
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    authenticate,
    authorize
};
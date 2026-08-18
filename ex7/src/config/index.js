require('dotenv').config();

const config = {
    port: process.env.PORT || 3000,
    mongoUrl: process.env.MONGO_URL || 'mongodb://localhost:27017/be-std',
    jwt: {
        accessSecret: process.env.JWT_ACCESS_SECRET,
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
    },
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
        max: parseInt(process.env.RATE_LIMIT_MAX) || 5,
        message: process.env.RATE_LIMIT_MESSAGE || 'Too many login attempts, please try again later'
    }
};

const validateConfig = () => {
    const required = [
        'JWT_ACCESS_SECRET',
        'JWT_REFRESH_SECRET'
    ];

    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
};

module.exports = {
    config,
    validateConfig
};
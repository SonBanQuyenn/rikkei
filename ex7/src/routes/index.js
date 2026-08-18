const express = require('express');
const router = express.Router();
const authRoutes = require('./authRoutes');
const { apiLimiter } = require('../middlewares/rateLimiter');

router.use('/auth', authRoutes);

router.get('/health', apiLimiter, (req, res) => {
    res.json({
        success: true,
        message: 'API is healthy',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
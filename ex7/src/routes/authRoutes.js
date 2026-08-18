const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const { loginLimiter, apiLimiter } = require('../middlewares/rateLimiter');

router.post('/login', loginLimiter, authController.login);
router.post('/refresh', apiLimiter, authController.refreshToken);
router.get('/protected', authenticate, authController.protectedRoute);

module.exports = router;
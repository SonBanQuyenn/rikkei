const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

router.get('/:userId/orders', orderController.getOrdersByUser);

module.exports = router;
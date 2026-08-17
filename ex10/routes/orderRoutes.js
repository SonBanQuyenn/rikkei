const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');

router.get('/orders/:id', orderController.getOrderById);

module.exports = router;
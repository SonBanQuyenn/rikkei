const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.get('/slow', reportController.getSlowReport);
router.get('/fast', reportController.getFastReport);

module.exports = router;
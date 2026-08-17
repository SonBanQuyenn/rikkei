const express = require('express');
const router = express.Router();
const bookController = require('../controllers/bookController');
const versionResolver = require('../middleware/versionResolver');
const deprecationHeaders = require('../middleware/deprecationHeaders');

router.get('/', versionResolver, deprecationHeaders, bookController.getBooks);

module.exports = router;
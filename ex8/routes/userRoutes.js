const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.get('/:id', userController.getUserById);
router.post('/', userController.createUser);
router.get('/secret', userController.getSecret);

module.exports = router;
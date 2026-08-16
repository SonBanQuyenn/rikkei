const express = require('express');
const router = express.Router();
const employeeController = require('../controllers/employeeController');
const upload = require('../middlewares/upload');

router.get('/', employeeController.getEmployees);
router.get('/:id', employeeController.getEmployeeById);
router.post('/', employeeController.createEmployee);
router.post('/:id/avatar', upload.single('avatar'), employeeController.uploadAvatar);

module.exports = router;
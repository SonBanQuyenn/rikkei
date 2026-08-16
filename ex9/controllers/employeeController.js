const Employee = require('../models/Employee');
const AppError = require('../utils/AppError');

const getEmployees = (req, res, next) => {
    try {
        const employees = Employee.getAll();
        res.json({
            success: true,
            data: employees
        });
    } catch (error) {
        next(error);
    }
};

const getEmployeeById = (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const employee = Employee.findById(id);

        if (!employee) {
            throw new AppError('Không tìm thấy nhân viên', 404);
        }

        res.json({
            success: true,
            data: employee
        });
    } catch (error) {
        next(error);
    }
};

const createEmployee = (req, res, next) => {
    try {
        const { name, email } = req.body;

        if (!name || !email) {
            throw new AppError('Vui lòng cung cấp đầy đủ name và email', 400);
        }

        const existingEmployee = Employee.findByEmail(email);
        if (existingEmployee) {
            throw new AppError('Email đã tồn tại', 409);
        }

        const newEmployee = Employee.create({ name, email });

        res.status(201).json({
            success: true,
            data: newEmployee
        });
    } catch (error) {
        next(error);
    }
};

const uploadAvatar = (req, res, next) => {
    try {
        const id = parseInt(req.params.id);
        const employee = Employee.findById(id);

        if (!employee) {
            throw new AppError('Không tìm thấy nhân viên', 404);
        }

        if (!req.file) {
            throw new AppError('Không có file được upload', 400);
        }

        const updatedEmployee = Employee.updateAvatar(id, req.file.filename);

        res.json({
            success: true,
            message: 'Upload ảnh thành công',
            data: updatedEmployee
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    getEmployees,
    getEmployeeById,
    createEmployee,
    uploadAvatar
};
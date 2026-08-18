const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Tên cửa hàng là bắt buộc'],
        minLength: [3, 'Tên cửa hàng phải có tối thiểu 3 ký tự']
    },
    phone: {
        type: String,
        required: [true, 'Số điện thoại là bắt buộc']
    },
    email: {
        type: String,
        required: [true, 'Email là bắt buộc'],
        match: [/^\S+@\S+\.\S+$/, 'Email không hợp lệ']
    },
    location: {
        street: {
            type: String,
            required: [true, 'Địa chỉ đường là bắt buộc']
        },
        district: {
            type: String,
            required: [true, 'Quận/Huyện là bắt buộc']
        },
        city: {
            type: String,
            required: [true, 'Thành phố là bắt buộc']
        }
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

const Store = mongoose.model('Store', storeSchema);

module.exports = Store;
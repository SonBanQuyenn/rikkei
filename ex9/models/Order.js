const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    orderNumber: {
        type: String,
        required: [true, 'Mã đơn hàng là bắt buộc'],
        unique: true
    },
    product_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
        required: [true, 'Sản phẩm là bắt buộc']
    },
    quantity: {
        type: Number,
        required: [true, 'Số lượng là bắt buộc'],
        min: [1, 'Số lượng tối thiểu là 1']
    },
    totalPrice: {
        type: Number,
        required: [true, 'Tổng tiền là bắt buộc'],
        min: [0, 'Tổng tiền không được âm']
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    customerName: {
        type: String,
        required: [true, 'Tên khách hàng là bắt buộc']
    },
    customerPhone: {
        type: String,
        required: [true, 'Số điện thoại khách hàng là bắt buộc']
    },
    customerAddress: {
        type: String,
        required: [true, 'Địa chỉ giao hàng là bắt buộc']
    }
}, {
    timestamps: true
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
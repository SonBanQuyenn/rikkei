const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Tên sản phẩm là bắt buộc'],
        minLength: [5, 'Tên sản phẩm phải có tối thiểu 5 ký tự']
    },
    price: {
        type: Number,
        required: [true, 'Giá sản phẩm là bắt buộc'],
        min: [0, 'Giá sản phẩm không được là số âm']
    },
    category: {
        type: String,
        required: [true, 'Danh mục sản phẩm là bắt buộc']
    },
    stock: {
        type: Number,
        default: 0,
        min: [0, 'Số lượng tồn kho không được âm']
    }
}, {
    timestamps: true
});

const Product = mongoose.model('Product', productSchema);

module.exports = Product;
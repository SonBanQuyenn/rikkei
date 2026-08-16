const Product = require('../models/Product');

const getProducts = (req, res) => {
    const products = Product.getAll();
    res.json(products);
};

const createProduct = (req, res) => {
    const { name, price, quantity } = req.body;
    const newProduct = Product.create({ name, price, quantity });
    res.status(201).json(newProduct);
};

module.exports = {
    getProducts,
    createProduct
};
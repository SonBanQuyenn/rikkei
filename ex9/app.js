const express = require('express');
const orderRoutes = require('./routes/orderRoutes');
const { sequelize, Product } = require('./models');

const app = express();
const PORT = 3000;

app.use(express.json());

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
    next();
});

app.use('/api/v1', orderRoutes);

app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const response = {
        success: false,
        message: err.message || 'Internal Server Error'
    };
    
    if (err.code) {
        response.code = err.code;
    }
    
    res.status(statusCode).json(response);
});

const initData = async () => {
    try {
        await sequelize.sync({ force: true });
        
        await Product.bulkCreate([
            { name: 'Sách Clean Code', price: 150000, stock: 10 },
            { name: 'Sách The Pragmatic Programmer', price: 200000, stock: 5 },
            { name: 'Sách Design Patterns', price: 180000, stock: 8 },
            { name: 'Sách Refactoring', price: 160000, stock: 3 },
            { name: 'Sách Introduction to Algorithms', price: 250000, stock: 2 }
        ]);
        
        console.log('✅ Database synchronized and sample data inserted');
    } catch (error) {
        console.error('❌ Error initializing database:', error);
    }
};

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await initData();
});
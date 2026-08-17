const express = require('express');
const productRoutes = require('./routes/productRoutes');

const app = express();
const PORT = 3000;

app.use(express.json());

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
    next();
});

app.use('/api/v1', productRoutes);

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

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
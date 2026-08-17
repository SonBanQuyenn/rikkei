const express = require('express');
const bookRoutes = require('./routes/bookRoutes');

const app = express();
const PORT = 3000;

app.use(express.json());

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
    console.log('API-Version:', req.headers['api-version'] || 'not provided');
    next();
});

app.use('/api/books', bookRoutes);

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
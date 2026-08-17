const express = require('express');
const { sequelize } = require('./models');
const { queryCounter } = require('./middlewares/queryCounter');
const reportRoutes = require('./routes/reportRoutes');

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(queryCounter);

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url} - ${new Date().toISOString()}`);
    next();
});

app.use('/api/v1/report', reportRoutes);

app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
});

sequelize.sync().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
});
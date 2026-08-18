require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { config, validateConfig } = require('./config');
const routes = require('./routes');

const app = express();

try {
    validateConfig();
    console.log('✓ Environment variables validated');
} catch (error) {
    console.error('✗ Configuration error:', error.message);
    process.exit(1);
}

app.use(express.json());

app.use('/api', routes);

app.get('/', (req, res) => {
    res.json({
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

mongoose.connect(config.mongoUrl)
    .then(() => {
        console.log('✓ MongoDB connected successfully');
    })
    .catch((error) => {
        console.error('✗ MongoDB connection error:', error.message);
        process.exit(1);
    });

app.listen(config.port, () => {
    console.log(`Server is running on http://localhost:${config.port}`);
    console.log(`Rate Limit: ${config.rateLimit.max} requests per ${config.rateLimit.windowMs / 60000} minutes`);
});
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { config, validateConfig } = require('./config');

const app = express();

try {
    validateConfig();
    console.log('✓ Environment variables validated');
} catch (error) {
    console.error('✗ Configuration error:', error.message);
    process.exit(1);
}

app.use(express.json());

app.get('/', (req, res) => {
    res.json({
        message: 'Server is running',
        timestamp: new Date().toISOString()
    });
});

app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        message: 'Configuration loaded successfully',
        config: {
            port: config.port,
            mongoUrl: config.mongoUrl.replace(/\/\/.*@/, '//***:***@'),
            jwt: {
                accessSecret: config.jwt.accessSecret ? '***' : undefined,
                refreshSecret: config.jwt.refreshSecret ? '***' : undefined,
                accessExpiresIn: config.jwt.accessExpiresIn,
                refreshExpiresIn: config.jwt.refreshExpiresIn
            }
        }
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
});
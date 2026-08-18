const mongoose = require('mongoose');
const User = require('../models/User');
const { config } = require('../config');

const seedUsers = async () => {
    try {
        await mongoose.connect(config.mongoUrl);

        await User.deleteMany({});

        const users = [
            {
                email: 'admin@example.com',
                password: 'admin123',
                name: 'Admin User',
                role: 'admin'
            },
            {
                email: 'user@example.com',
                password: 'user123',
                name: 'Normal User',
                role: 'user'
            },
            {
                email: 'john@example.com',
                password: 'john123',
                name: 'John Doe',
                role: 'user'
            }
        ];

        await User.insertMany(users);

        console.log('✓ Seeded users successfully:');
        users.forEach(user => {
            console.log(`  - ${user.email} (${user.role})`);
        });

    } catch (error) {
        console.error('✗ Seed error:', error.message);
    } finally {
        await mongoose.connection.close();
    }
};

seedUsers();
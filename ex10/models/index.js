const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize('n1_demo', 'root', 'password', {
    host: 'localhost',
    dialect: 'mysql',
    logging: false
});

const Category = sequelize.define('Category', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(100),
        allowNull: false
    }
}, {
    tableName: 'categories',
    timestamps: true
});

const Product = sequelize.define('Product', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING(200),
        allowNull: false
    },
    price: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    categoryId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        field: 'category_id'
    }
}, {
    tableName: 'products',
    timestamps: true
});

Category.hasMany(Product, {
    foreignKey: 'categoryId',
    as: 'products'
});

Product.belongsTo(Category, {
    foreignKey: 'categoryId',
    as: 'category'
});

module.exports = {
    sequelize,
    Category,
    Product
};
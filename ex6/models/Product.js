const products = require('../data/products');

const getAll = () => {
    return products;
};

const findAndCountAll = (options) => {
    let filteredProducts = [...products];
    
    if (options.keyword) {
        const keyword = options.keyword.toLowerCase();
        filteredProducts = filteredProducts.filter(product => 
            product.name.toLowerCase().includes(keyword)
        );
    }
    
    const total = filteredProducts.length;
    
    if (options.sort) {
        const [field, order] = options.sort.split('_');
        filteredProducts.sort((a, b) => {
            if (field === 'price') {
                return order === 'asc' ? a.price - b.price : b.price - a.price;
            }
            return order === 'asc' ? a.id - b.id : b.id - a.id;
        });
    } else {
        filteredProducts.sort((a, b) => b.id - a.id);
    }
    
    const start = (options.page - 1) * options.limit;
    const end = start + options.limit;
    const paginatedProducts = filteredProducts.slice(start, end);
    
    return {
        rows: paginatedProducts,
        count: total
    };
};

module.exports = {
    getAll,
    findAndCountAll
};
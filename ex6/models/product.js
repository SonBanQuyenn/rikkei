let products = [
    { id: 1, name: 'Laptop', price: 15000000, quantity: 10 },
    { id: 2, name: 'Smartphone', price: 8000000, quantity: 25 },
    { id: 3, name: 'Headphone', price: 1500000, quantity: 50 }
];

let nextId = 4;

const getAll = () => {
    return products;
};

const findById = (id) => {
    return products.find(product => product.id === id);
};

const create = (data) => {
    const newProduct = {
        id: nextId++,
        name: data.name,
        price: data.price,
        quantity: data.quantity
    };
    products.push(newProduct);
    return newProduct;
};

module.exports = {
    getAll,
    findById,
    create
};
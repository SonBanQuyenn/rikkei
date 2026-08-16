let employees = [
    { id: 1, name: 'Nguyen Van A', email: 'a@example.com', avatarUrl: null },
    { id: 2, name: 'Tran Thi B', email: 'b@example.com', avatarUrl: null }
];

let nextId = 3;

const getAll = () => {
    return employees;
};

const findById = (id) => {
    return employees.find(emp => emp.id === id);
};

const create = (data) => {
    const newEmployee = {
        id: nextId++,
        name: data.name,
        email: data.email,
        avatarUrl: null
    };
    employees.push(newEmployee);
    return newEmployee;
};

const updateAvatar = (id, avatarUrl) => {
    const employee = findById(id);
    if (!employee) return null;
    employee.avatarUrl = avatarUrl;
    return employee;
};

const findByEmail = (email) => {
    return employees.find(emp => emp.email === email);
};

module.exports = {
    getAll,
    findById,
    create,
    updateAvatar,
    findByEmail
};
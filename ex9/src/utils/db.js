// Danh sach user gia lap de test dang nhap (khong ma hoa mat khau, chi phuc vu bai tap don gian)
const users = [
  { id: 1, username: "hungpv", password: "123456", fullName: "Pham Van Hung" },
  { id: 2, username: "admin", password: "admin123", fullName: "Administrator" },
];

const findUserByUsername = (username) => users.find((u) => u.username === username);

module.exports = { users, findUserByUsername };

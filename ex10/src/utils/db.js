const bcrypt = require("bcryptjs");

/**
 * "Co so du lieu" gia lap bang mang trong bo nho (in-memory).
 * Trong du an that se thay bang MongoDB / MySQL / PostgreSQL...
 */

const users = [
  {
    id: 1,
    username: "hungpv",
    password: bcrypt.hashSync("123456", 10), // password goc: "123456"
    fullName: "Pham Van Hung",
  },
  {
    id: 2,
    username: "admin",
    password: bcrypt.hashSync("admin123", 10),
    fullName: "Administrator",
  },
];

// Danh sach refreshToken hop le da cap phat (chua bi thu hoi/huy)
let refreshTokens = [];

const findUserByUsername = (username) => users.find((u) => u.username === username);
const findUserById = (id) => users.find((u) => u.id === id);

const saveRefreshToken = (token) => refreshTokens.push(token);
const isRefreshTokenValid = (token) => refreshTokens.includes(token);
const revokeRefreshToken = (token) => {
  refreshTokens = refreshTokens.filter((t) => t !== token);
};

module.exports = {
  users,
  findUserByUsername,
  findUserById,
  saveRefreshToken,
  isRefreshTokenValid,
  revokeRefreshToken,
};

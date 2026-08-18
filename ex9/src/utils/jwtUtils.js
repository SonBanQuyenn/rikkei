const jwt = require("jsonwebtoken");

const TOKEN_SECRET = process.env.TOKEN_SECRET;
const TOKEN_EXPIRES_IN = process.env.TOKEN_EXPIRES_IN || "15m";

const generateToken = (payload) => {
  return jwt.sign(payload, TOKEN_SECRET, { expiresIn: TOKEN_EXPIRES_IN });
};

const verifyToken = (token) => {
  return jwt.verify(token, TOKEN_SECRET);
};

module.exports = { generateToken, verifyToken };

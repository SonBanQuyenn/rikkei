const { generateToken } = require("../utils/jwtUtils");
const { findUserByUsername } = require("../utils/db");

/**
 * POST /api/auth/login
 * Dang nhap don gian de lay Token dung cho viec test Middleware.
 * (Trong tam bai tap nay la Middleware, khong phai vong doi token)
 */
const login = (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      status: 400,
      message: "MISSING_CREDENTIALS",
      errors: "username va password la bat buoc",
    });
  }

  const user = findUserByUsername(username);
  if (!user || user.password !== password) {
    return res.status(400).json({
      status: 400,
      message: "INVALID_CREDENTIALS",
      errors: null,
    });
  }

  const token = generateToken({ id: user.id, username: user.username });

  return res.status(200).json({
    status: 200,
    message: "LOGIN_SUCCESS",
    data: {
      token: `Bearer ${token}`,
    },
  });
};

module.exports = { login };

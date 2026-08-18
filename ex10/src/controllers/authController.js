const bcrypt = require("bcryptjs");
const {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} = require("../utils/jwtUtils");
const {
  findUserByUsername,
  findUserById,
  saveRefreshToken,
  isRefreshTokenValid,
} = require("../utils/db");

/**
 * POST /api/auth/login
 * Dang nhap bang username + password -> cap phat Access Token + Refresh Token
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
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({
      status: 400,
      message: "INVALID_CREDENTIALS",
      errors: null,
    });
  }

  const payload = { id: user.id, username: user.username };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Luu refreshToken vao "DB" de sau nay con kiem tra con hop le / chua bi huy
  saveRefreshToken(refreshToken);

  return res.status(200).json({
    status: 200,
    message: "LOGIN_SUCCESS",
    data: {
      accessToken: `Bearer ${accessToken}`,
      refreshToken: `Bearer ${refreshToken}`,
    },
  });
};

/**
 * POST /api/auth/refresh-token
 * Logic:
 * 1. Xac thuc chu ky cua Refresh Token
 * 2. Truy van "DB" de dam bao token nay chua bi huy (con hop le)
 * 3. Neu chuan xac -> Ky (sign) mot Access Token hoan toan moi
 */
const refreshToken = (req, res) => {
  let { refreshToken: token } = req.body;

  if (!token) {
    return res.status(400).json({
      status: 400,
      message: "REFRESH_TOKEN_REQUIRED",
      errors: null,
    });
  }

  if (token.startsWith("Bearer ")) {
    token = token.split(" ")[1];
  }

  // Buoc 1: Xac thuc chu ky + han su dung cua Refresh Token
  let decoded;
  try {
    decoded = verifyRefreshToken(token);
  } catch (error) {
    return res.status(401).json({
      status: 401,
      message: error.name === "TokenExpiredError" ? "REFRESH_TOKEN_EXPIRED" : "INVALID_REFRESH_TOKEN",
      errors: null,
    });
  }

  // Buoc 2: Kiem tra token nay co con hop le / chua bi thu hoi trong "DB" khong
  if (!isRefreshTokenValid(token)) {
    return res.status(401).json({
      status: 401,
      message: "REFRESH_TOKEN_REVOKED",
      errors: null,
    });
  }

  const user = findUserById(decoded.id);
  if (!user) {
    return res.status(401).json({
      status: 401,
      message: "USER_NOT_FOUND",
      errors: null,
    });
  }

  // Buoc 3: Cap phat mot Access Token hoan toan moi
  const newAccessToken = generateAccessToken({ id: user.id, username: user.username });

  return res.status(200).json({
    status: 200,
    message: "SUCCESS",
    data: {
      accessToken: `Bearer ${newAccessToken}`,
    },
  });
};

module.exports = { login, refreshToken };

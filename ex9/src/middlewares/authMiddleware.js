const { verifyToken } = require("../utils/jwtUtils");

/**
 * [Bai tap - Gioi] Middleware chot chan (Authentication)
 *
 * Luong hoat dong:
 * 1. Boc tach JWT tu Header "Authorization: Bearer <token>"
 * 2. Verify Token hop le hay khong
 * 3. Neu Token sai hoac het han -> tu choi, tra 401 va chan lai (khong goi next())
 * 4. Neu dung -> giai ma du lieu, gan vao req.user, cho phep di tiep vao Controller (next())
 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers["authorization"];

  // Khong co header, hoac sai dinh dang "Bearer <token>"
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      status: 401,
      message: "TOKEN_REQUIRED",
      errors: null,
    });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({
      status: 401,
      message: "TOKEN_REQUIRED",
      errors: null,
    });
  }

  try {
    // Giai ma va xac minh chu ky cua token
    const decoded = verifyToken(token);

    // Gan thong tin user da giai ma vao request de Controller phia sau su dung
    req.user = decoded;

    // Token hop le -> cho phep di tiep
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        status: 401,
        message: "TOKEN_EXPIRED",
        errors: null,
      });
    }

    return res.status(401).json({
      status: 401,
      message: "INVALID_TOKEN",
      errors: null,
    });
  }
};

module.exports = authMiddleware;

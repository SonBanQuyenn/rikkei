const { users } = require("../utils/db");

/**
 * GET /api/users
 * Route duoc bao ve boi authMiddleware.
 * Chi vao duoc day khi Token hop le (middleware da goi next()).
 */
const getAllUsers = (req, res) => {
  const safeUsers = users.map(({ id, username, fullName }) => ({ id, username, fullName }));

  return res.status(200).json({
    status: 200,
    message: "SUCCESS",
    data: safeUsers,
    // req.user duoc gan boi authMiddleware sau khi giai ma token
    requestedBy: req.user,
  });
};

module.exports = { getAllUsers };

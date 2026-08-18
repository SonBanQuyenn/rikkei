const express = require("express");
const router = express.Router();
const { login, refreshToken } = require("../controllers/authController");

// POST /api/auth/login
router.post("/login", login);

// POST /api/auth/refresh-token
router.post("/refresh-token", refreshToken);

module.exports = router;

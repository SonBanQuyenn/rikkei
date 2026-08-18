const express = require("express");
const router = express.Router();
const authMiddleware = require("../middlewares/authMiddleware");
const { getAllUsers } = require("../controllers/userController");

// GET /api/users -> can Token hop le, di qua authMiddleware truoc
router.get("/", authMiddleware, getAllUsers);

module.exports = router;

const express = require("express");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({
    status: 200,
    message: "BAI 1 - MIDDLEWARE AUTH API DANG CHAY",
    endpoints: {
      login: "POST /api/auth/login  (de lay token dung test)",
      getAllUsers: "GET /api/users  (can Authorization: Bearer <token>)",
    },
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);

app.use((req, res) => {
  res.status(404).json({ status: 404, message: "NOT_FOUND", errors: null });
});

module.exports = app;

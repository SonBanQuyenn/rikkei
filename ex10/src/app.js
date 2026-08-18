const express = require("express");
const authRoutes = require("./routes/authRoutes");

const app = express();
app.use(express.json());

app.get("/", (req, res) => {
  res.status(200).json({
    status: 200,
    message: "BAI 2 - REFRESH TOKEN API DANG CHAY",
    endpoints: {
      login: "POST /api/auth/login",
      refreshToken: "POST /api/auth/refresh-token",
    },
  });
});

app.use("/api/auth", authRoutes);

app.use((req, res) => {
  res.status(404).json({ status: 404, message: "NOT_FOUND", errors: null });
});

module.exports = app;

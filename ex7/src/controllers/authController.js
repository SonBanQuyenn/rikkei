const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require('../middlewares/auth');

const login = (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Username and password are required'
        });
    }

    if (username === 'admin' && password === 'admin123') {
        const payload = { id: 1, username: 'admin', role: 'admin' };

        const accessToken = generateAccessToken(payload);
        const refreshToken = generateRefreshToken(payload);

        return res.json({
            success: true,
            data: {
                accessToken,
                refreshToken,
                user: payload
            }
        });
    }

    return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
    });
};

const refreshToken = (req, res) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(400).json({
            success: false,
            message: 'Refresh token is required'
        });
    }

    const decoded = verifyRefreshToken(refreshToken);

    if (!decoded) {
        return res.status(401).json({
            success: false,
            message: 'Invalid or expired refresh token'
        });
    }

    const payload = { id: decoded.id, username: decoded.username, role: decoded.role };
    const newAccessToken = generateAccessToken(payload);

    res.json({
        success: true,
        data: {
            accessToken: newAccessToken
        }
    });
};

const protectedRoute = (req, res) => {
    res.json({
        success: true,
        message: 'This is a protected route',
        user: req.user
    });
};

module.exports = {
    login,
    refreshToken,
    protectedRoute
};
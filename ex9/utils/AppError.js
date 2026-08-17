class AppError extends Error {
    constructor(message, statusCode, code) {
        super(message);
        this.statusCode = statusCode;
        this.code = code || null;
        this.isOperational = true;
    }
}

module.exports = AppError;
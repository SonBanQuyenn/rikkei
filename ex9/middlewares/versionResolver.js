const AppError = require('../utils/AppError');

const versionResolver = (req, res, next) => {
    const apiVersion = req.headers['api-version'] || 'v1';

    const supportedVersions = ['v1', 'v2'];

    if (!supportedVersions.includes(apiVersion)) {
        throw new AppError('Unsupported API version', 400, 'UNSUPPORTED_API_VERSION');
    }

    req.apiVersion = apiVersion;
    next();
};

module.exports = versionResolver;
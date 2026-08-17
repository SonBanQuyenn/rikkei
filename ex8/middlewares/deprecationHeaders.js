const deprecationHeaders = (req, res, next) => {
    res.setHeader('Deprecation', 'true');
    res.setHeader('Sunset', 'Wed, 31 Dec 2025 23:59:59 GMT');
    next();
};

module.exports = deprecationHeaders;
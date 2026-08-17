let queryCount = 0;
let startTime = 0;

const queryCounter = (req, res, next) => {
    queryCount = 0;
    startTime = Date.now();

    const originalQuery = res.json;
    res.json = function(data) {
        if (data && data.meta) {
            data.meta.queryCount = queryCount;
            data.meta.durationMs = Date.now() - startTime;
        }
        originalQuery.call(this, data);
    };

    next();
};

const incrementQueryCount = () => {
    queryCount++;
};

module.exports = {
    queryCounter,
    incrementQueryCount
};
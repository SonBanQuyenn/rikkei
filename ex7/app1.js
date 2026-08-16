const logger = require('./logger');

logger.info('app1: khởi động module app1');
logger.warn('app1: cảnh báo thử nghiệm từ app1');
logger.error('app1: lỗi thử nghiệm từ app1');

module.exports = logger;

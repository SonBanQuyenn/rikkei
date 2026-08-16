const path = require('path');

// __dirname có sẵn tự nhiên trong CommonJS -> dùng thẳng để trỏ tới .env
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

// require file JSON trực tiếp - CommonJS hỗ trợ sẵn, không cần cú pháp đặc biệt
const pkg = require('./package.json');

const PROCESSING_DELAY_MS = Number(process.env.PROCESSING_DELAY_MS) || 2000;
const LOG_TIMEZONE = process.env.LOG_TIMEZONE || 'UTC';

module.exports = {
  PROCESSING_DELAY_MS,
  LOG_TIMEZONE,
  APP_VERSION: pkg.version,
};

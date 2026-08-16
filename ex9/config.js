require('dotenv').config({ quiet: true });

// Đọc PROCESSING_DELAY_MS (số mili-giây mô phỏng xử lý, ví dụ 2000)
const PROCESSING_DELAY_MS = Number(process.env.PROCESSING_DELAY_MS) || 2000;

// Đọc LOG_TIMEZONE để hiển thị timestamp theo múi giờ mong muốn
const LOG_TIMEZONE = process.env.LOG_TIMEZONE || 'UTC';

const config = {
  PROCESSING_DELAY_MS,
  LOG_TIMEZONE,
};

module.exports = config;

require('dotenv').config();

// Biến đếm số lần module logger.js được nạp (load) LẦN ĐẦU.
// Đặt ở ngoài các hàm export -> chỉ chạy 1 lần duy nhất nhờ cơ chế cache module của CommonJS,
// dù có bao nhiêu file require('./logger') đi chăng nữa.
let initCount = 0;
initCount++;

// Thứ tự độ ưu tiên (số càng lớn càng "nghiêm trọng")
const LEVELS = {
  info: 0,
  warn: 1,
  error: 2,
};

// Đọc mức log tối thiểu từ biến môi trường LOG_LEVEL (info / warn / error)
// Mặc định là 'info' nếu không có / giá trị không hợp lệ.
const rawLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const currentLevel = LEVELS.hasOwnProperty(rawLevel) ? rawLevel : 'info';

function shouldLog(level) {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function info(msg) {
  if (shouldLog('info')) {
    console.log(`[INFO] ${msg}`);
  }
}

function warn(msg) {
  if (shouldLog('warn')) {
    console.log(`[WARN] ${msg}`);
  }
}

function error(msg) {
  if (shouldLog('error')) {
    console.log(`[ERROR] ${msg}`);
  }
}

function getInitCount() {
  return initCount;
}

module.exports = { info, warn, error, getInitCount };

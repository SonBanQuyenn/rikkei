// check.js không require('./logger') trực tiếp mà require GIÁN TIẾP
// thông qua app1, app2, app3 (mỗi app đều require('./logger') ở trên).
const loggerViaApp1 = require('./app1');
const loggerViaApp2 = require('./app2');
const loggerViaApp3 = require('./app3');

console.log('----------------------------------------');
console.log('initCount (qua app1):', loggerViaApp1.getInitCount());
console.log('initCount (qua app2):', loggerViaApp2.getInitCount());
console.log('initCount (qua app3):', loggerViaApp3.getInitCount());
console.log('----------------------------------------');
console.log(
  'Kết luận: nhờ CommonJS cache module (require.cache), logger.js chỉ thực sự được nạp' +
  ' và chạy code khởi tạo (initCount++) đúng 1 LẦN, dù được require từ 3 module khác nhau' +
  ' (app1, app2, app3) và require gián tiếp từ check.js. Mọi lần require sau chỉ trả về' +
  ' cùng 1 object đã được cache => initCount luôn = 1.'
);

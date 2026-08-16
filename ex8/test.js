const NotificationCenter = require('./notificationCenter');

const center = new NotificationCenter();

console.log('===== Bắt đầu kịch bản test (6 sự kiện) =====');

console.log('\n--- (1) user:registered ---');
center.emitSafe('user:registered', { id: 1, name: 'Nguyễn Văn A' });

console.log('\n--- (2) order:created (bình thường) ---');
center.emitSafe('order:created', { id: 101, total: 200000 });

console.log('\n--- (3) order:created (giá trị lớn, chưa huỷ nên chưa lỗi) ---');
center.emitSafe('order:created', { id: 102, total: 1500000 });

console.log('\n--- (4) order:cancelled (total <= 1.000.000 -> không lỗi) ---');
center.emitSafe('order:cancelled', { id: 101, total: 200000 });

console.log('\n--- (5) order:cancelled (total > 1.000.000 -> CỐ TÌNH GÂY LỖI) ---');
center.emitSafe('order:cancelled', { id: 102, total: 1500000 });

console.log('\n--- (6) order:created (chạy SAU sự kiện lỗi, chứng minh không bị crash) ---');
center.emitSafe('order:created', { id: 103, total: 50000 });

console.log('\n===== Kết thúc kịch bản test - chương trình chạy hết, không crash =====');

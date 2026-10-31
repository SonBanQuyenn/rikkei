// Tác vụ định kỳ chạy trên máy chủ NGOÀI cloud (bẫy 2) - xem config/invoice-cron.crontab.
// Credential: AWS_PROFILE=shopfast-onprem-cron -> credential_process -> IAM Roles Anywhere (chứng chỉ X.509).
// Mã nguồn y hệt ứng dụng trên EC2: không có dòng nào đọc khoá truy cập.
import { logCallerIdentity } from '../src/aws-clients.js';
import { query, closeDb } from '../src/db.js';
import { createInvoice } from '../src/invoices.js';

await logCallerIdentity();

const { rows } = await query(
  `SELECT id FROM orders
    WHERE invoice_key IS NULL AND status = 'PAID' AND created_at < now() - interval '1 hour'
    ORDER BY created_at LIMIT 500`
);
console.info(`[job] ${rows.length} đơn hàng chưa có hoá đơn`);

let ok = 0;
for (const { id } of rows) {
  try {
    await createInvoice(id);
    ok++;
  } catch (err) {
    console.error(`[job] đơn ${id} lỗi: ${err.name} ${err.message}`);
  }
}
console.info(`[job] xong: ${ok}/${rows.length}`);
await closeDb();
process.exitCode = ok === rows.length ? 0 : 1;

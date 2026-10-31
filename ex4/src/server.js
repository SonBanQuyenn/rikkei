// Ứng dụng chạy trên máy chủ EC2 (hoặc máy lập trình viên với AWS_PROFILE=shopfast-dev).
//   POST /orders/:id/invoice  -> tạo hoá đơn PDF và ghi lên S3
import http from 'node:http';
import { config } from './config.js';
import { logCallerIdentity } from './aws-clients.js';
import { createInvoice } from './invoices.js';
import { closeDb } from './db.js';

const server = http.createServer(async (req, res) => {
  const m = req.method === 'POST' && req.url.match(/^\/orders\/([\w-]+)\/invoice$/);
  if (!m) {
    res.writeHead(404).end();
    return;
  }
  try {
    const result = await createInvoice(m[1]);
    res.writeHead(201, { 'content-type': 'application/json' }).end(JSON.stringify(result));
  } catch (err) {
    console.error('[invoice] lỗi', err.name, err.message);
    // Không trả chi tiết lỗi (có thể chứa thông tin hạ tầng) cho client
    res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"invoice_failed"}');
  }
});

await logCallerIdentity();
server.listen(config.port, () => console.info(`[server] lắng nghe cổng ${config.port}`));

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => closeDb().finally(() => process.exit(0))));
}

// Kết nối PostgreSQL bằng bí mật lấy từ Secrets Manager.
// Xoay vòng không gián đoạn:
//   - Secrets Manager dùng chiến lược "alternating users": luân phiên 2 user CSDL (invoice_app / invoice_app_clone).
//     Mật khẩu cũ vẫn đúng cho tới lần xoay kế tiếp => kết nối đang mở không bị cắt.
//   - Ứng dụng làm mới bí mật mỗi TTL; nếu vẫn gặp lỗi sai mật khẩu (28P01) thì lấy bí mật mới,
//     dựng pool mới và thử lại đúng 1 lần.
import pg from 'pg';
import { secretsManager } from './aws-clients.js';
import { CachedSecret } from './secrets.js';
import { config } from './config.js';

const INVALID_PASSWORD = '28P01';
const dbSecret = new CachedSecret(secretsManager, config.dbSecretId, config.secretCacheTtlMs);

let pool = null;
let poolUser = null;

async function buildPool(forceRefresh = false) {
  const s = await dbSecret.get({ forceRefresh });
  if (pool && poolUser === s.username && !forceRefresh) return pool;
  const old = pool;
  pool = new pg.Pool({
    host: s.host,
    port: s.port,
    database: s.dbname,
    user: s.username,
    password: s.password,
    ssl: { rejectUnauthorized: true },
    max: 10,
  });
  poolUser = s.username;
  // Đóng pool cũ sau khi các truy vấn đang chạy kết thúc
  if (old) old.end().catch(() => {});
  return pool;
}

export async function query(text, params) {
  const p = await buildPool();
  try {
    return await p.query(text, params);
  } catch (err) {
    if (err.code !== INVALID_PASSWORD) throw err;
    console.warn('[db] sai mật khẩu - có thể vừa xoay vòng; lấy bí mật mới và thử lại');
    const p2 = await buildPool(true);
    return p2.query(text, params);
  }
}

export async function closeDb() {
  if (pool) await pool.end();
}

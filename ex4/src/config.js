// Cấu hình ứng dụng. Chỉ chứa TÊN tài nguyên, không bao giờ chứa thông tin xác thực.

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Thiếu biến môi trường ${name}`);
  return v;
}

/**
 * Chặn cấu hình sai: khoá truy cập DÀI HẠN (AKIA...) trong biến môi trường.
 * Credential tạm hợp lệ (ASIA... + AWS_SESSION_TOKEN) vẫn được chấp nhận, ví dụ khi chạy trong pipeline.
 */
export function assertNoLongTermKeys(env = process.env) {
  const keyId = env.AWS_ACCESS_KEY_ID;
  if (keyId && (keyId.startsWith('AKIA') || !env.AWS_SESSION_TOKEN)) {
    throw new Error(
      'Phát hiện khoá truy cập dài hạn trong biến môi trường. ' +
        'Hãy xoá AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY và dùng Role (EC2), SSO (máy cá nhân) hoặc Roles Anywhere (ngoài cloud).'
    );
  }
}

export const config = {
  region: process.env.AWS_REGION ?? 'ap-southeast-1',
  invoiceBucket: required('INVOICE_BUCKET'),
  dbSecretId: required('DB_SECRET_ID'),
  // Thời gian giữ bí mật trong bộ nhớ: ngắn hơn nhiều so với cửa sổ xoay vòng.
  secretCacheTtlMs: Number(process.env.SECRET_CACHE_TTL_MS ?? 5 * 60 * 1000),
  port: Number(process.env.PORT ?? 3000),
};

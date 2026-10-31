# Bài tập 8 - Chọn cơ chế xác thực cho ứng dụng chạy trên máy chủ

## Cấu trúc thư mục

```
ex4/
├── bao-cao.md
├── iam/
│   ├── ec2-trust-policy.json               # Role cho máy chủ EC2
│   ├── prod-app-permission-policy.json     # quyền tối thiểu của ứng dụng + chặn dùng credential ngoài VPC
│   ├── rolesanywhere-trust-policy.json     # Role cho tác vụ ngoài cloud (chứng chỉ X.509)
│   ├── onprem-cron-permission-policy.json
│   └── dev-permission-set-policy.json      # quyền của lập trình viên khi chạy app trên máy cá nhân
├── infra/
│   ├── setup.sh                            # triển khai toàn bộ (aws CLI)
│   ├── launch-template.json                # IMDSv2 bắt buộc, hop limit 1
│   └── pki/tao-chung-chi.sh                # CA nội bộ + chứng chỉ cho tác vụ ngoài cloud
├── config/
│   ├── db-app.secret.json, db-master.secret.json   # khuôn dạng bí mật (không chứa giá trị thật)
│   ├── aws-config.developer                # ~/.aws/config máy lập trình viên (SSO)
│   ├── aws-config.onprem-cron              # ~/.aws/config máy chủ ngoài cloud (credential_process)
│   └── invoice-cron.crontab
├── src/                                    # mã nguồn ứng dụng (Node.js, AWS SDK v3)
│   ├── config.js        # chặn khoá dài hạn trong biến môi trường
│   ├── aws-clients.js   # client KHÔNG truyền credentials -> chuỗi provider mặc định
│   ├── secrets.js       # đọc + cache bí mật CSDL
│   ├── db.js            # pool PostgreSQL, tự làm mới khi bí mật xoay vòng
│   ├── invoices.js      # tạo PDF, ghi S3
│   ├── server.js        # HTTP: POST /orders/:id/invoice
│   └── whoami.js        # kiểm tra danh tính đang dùng
├── jobs/nightly-invoice-job.js             # tác vụ định kỳ ngoài cloud
├── .env.development, package.json
```

---

# A. Phân tích và đề xuất đa giải pháp

## A1. Đầu vào / đầu ra

**Đầu vào**
- Ứng dụng ShopFast (Node.js) cần 2 loại quyền: ghi PDF vào S3 `shopfast-prod-invoices`, đọc bí mật kết nối CSDL.
- 3 nơi chạy: máy chủ EC2 trong cloud, máy cá nhân của lập trình viên, máy chủ ngoài cloud chạy tác vụ định kỳ.
- Ràng buộc: máy chủ bị xâm nhập thì thiệt hại tối thiểu; xoay vòng không gián đoạn; chỉ 3 kỹ sư vận hành.

**Đầu ra**
- Mỗi môi trường có một cách lấy thông tin xác thực **tạm thời**, tự làm mới; cùng một mã nguồn.
- Bí mật CSDL lưu tập trung, xoay vòng tự động, ứng dụng tự nhận mật khẩu mới.
- Chính sách quyền tối thiểu cho từng danh tính.

**Các nơi ứng dụng cần thông tin xác thực**

| # | Nơi chạy | Cần gì | Thông tin xác thực AWS | Bí mật CSDL |
|---|---|---|---|---|
| 1 | EC2 trong cloud (prod) | `s3:PutObject` hoá đơn, đọc bí mật prod | cần | cần |
| 2 | Máy cá nhân lập trình viên (dev) | như trên nhưng **tài nguyên dev** | cần | cần (CSDL dev) |
| 3 | Máy chủ ngoài cloud - tác vụ định kỳ | như #1 | cần, **không gắn Role trực tiếp được** | cần |
| 4 | Lambda xoay vòng bí mật | đổi mật khẩu trong CSDL, ghi phiên bản bí mật mới | Role của Lambda | bí mật master |
| 5 | Pipeline triển khai | đẩy mã / image | OIDC (bài 6) | không |

## A2. Các giải pháp khả thi

| | Giải pháp | Cách hoạt động |
|---|---|---|
| (a) | Khoá truy cập dài hạn trong biến môi trường | Tạo IAM user, đặt `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` + `DB_PASSWORD` trong `.env` trên mỗi máy |
| (b) | Role gắn vào máy chủ | Instance profile; SDK lấy credential tạm từ IMDS. Mật khẩu CSDL vẫn trong file cấu hình |
| (c) | Dịch vụ quản lý bí mật tập trung | Mọi thứ (kể cả access key) để trong Secrets Manager / Vault - nhưng vẫn cần **một** credential để mở kho bí mật ("bí mật số 0") |
| (d) | **Role + Secrets Manager** | Role cung cấp credential AWS tạm thời; Secrets Manager giữ mật khẩu CSDL và xoay vòng tự động; ngoài cloud dùng **IAM Roles Anywhere** để có Role bằng chứng chỉ X.509 |

---

# B. So sánh và lựa chọn

| Tiêu chí | (a) Khoá dài hạn | (b) Role trên máy chủ | (c) Quản lý bí mật tập trung | (d) Role + Secrets Manager |
|---|---|---|---|---|
| **Thiệt hại khi máy chủ bị xâm nhập** | Rất cao: key dùng được **từ bất kỳ đâu, vô thời hạn** đến khi có người phát hiện; mật khẩu CSDL cố định | Trung bình: credential AWS hết hạn ≤ 6 giờ nhưng mật khẩu CSDL cố định bị lộ vĩnh viễn | Cao: "bí mật số 0" vẫn là khoá dài hạn → lộ là lộ cả kho | **Thấp**: credential AWS tạm (1 giờ), bị Deny nếu dùng ngoài VPC; mật khẩu CSDL đổi mỗi 30 ngày; quyền chỉ `PutObject invoices/*` + 1 bí mật |
| **Công sức xoay vòng** | Thủ công: tạo key mới → cập nhật mọi máy → xoá key cũ; dễ quên, dễ gián đoạn | AWS: 0; CSDL: thủ công | Xoay bí mật tự động, nhưng "bí mật số 0" thủ công | **Gần 0**: credential AWS do STS/SDK tự làm mới; mật khẩu CSDL do Lambda xoay vòng; chứng chỉ ngoài cloud 1 lần/năm |
| **Dùng chung cho dev / ngoài cloud** | Dễ - nhưng thường dẫn tới **dùng chung key prod** trên laptop | Không: laptop và máy ngoài cloud không có IMDS | Có nhưng vẫn cần key | **Có**: cùng mã nguồn; dev dùng SSO, ngoài cloud dùng Roles Anywhere - chuỗi provider mặc định của SDK tự chọn |
| **Chi phí** | 0 | 0 | Secrets Manager ~0,40 USD/bí mật/tháng; Vault tự vận hành tốn máy + công | ~0,80 USD/tháng (2 bí mật) + 0,05 USD/10.000 lời gọi; Roles Anywhere miễn phí; CA tự quản (không dùng AWS Private CA để tránh ~400 USD/tháng) |
| **Độ phức tạp vận hành** | Thấp lúc đầu, **cao về lâu dài** (kiểm kê, xoay, thu hồi key) | Thấp | Cao nếu tự vận hành Vault (HA, unseal, backup) | **Trung bình lúc dựng, thấp khi chạy**: tất cả là dịch vụ AWS quản lý, dựng bằng 1 script; việc định kỳ duy nhất là gia hạn chứng chỉ |

### Lựa chọn: (d) Role gắn vào máy chủ + Secrets Manager (+ IAM Roles Anywhere cho máy ngoài cloud)

| Ràng buộc nghiệp vụ | Vì sao (d) đáp ứng |
|---|---|
| Máy chủ bị xâm nhập → thiệt hại thấp nhất | Không có bí mật dài hạn nào nằm trên đĩa máy chủ. Credential AWS tự hết hạn sau ≤ 1 giờ; Deny theo `aws:EC2InstanceSourceVPC` làm credential lấy trộm **vô dụng ngoài VPC**; IMDSv2 + hop limit 1 chặn SSRF và container lấy trộm credential; quyền chỉ đủ ghi hoá đơn và đọc đúng 1 bí mật. Mật khẩu CSDL bị lộ cũng chỉ sống tối đa tới lần xoay kế tiếp (có thể xoay ngay bằng 1 lệnh). |
| Xoay vòng không gây gián đoạn | Credential AWS: SDK tự làm mới trước khi hết hạn. Mật khẩu CSDL: chiến lược **alternating users** - Secrets Manager luân phiên 2 user CSDL, mật khẩu cũ vẫn đúng cho đến lần xoay sau, nên kết nối đang mở không bị cắt; ứng dụng cache 5 phút và tự lấy bí mật mới khi gặp lỗi `28P01`. |
| **Chỉ có 3 kỹ sư vận hành** (ràng buộc quyết định) | Mọi phần "khó" đều do AWS vận hành: STS phát credential, Secrets Manager + Lambda mẫu của AWS xoay vòng, Roles Anywhere đổi chứng chỉ lấy credential. Không phải vận hành cụm Vault (loại (c)), không có quy trình xoay key thủ công định kỳ (loại (a)). Khối lượng việc định kỳ: **gia hạn 1 chứng chỉ mỗi năm**. Toàn bộ dựng bằng `infra/setup.sh`, lặp lại được. |

---

# C. Thiết kế và triển khai

## C1. Các bước thực hiện

1. **Bí mật CSDL** (`setup.sh` bước 1-2)
   1. Tạo user CSDL `invoice_app` chỉ có quyền `SELECT/UPDATE` trên bảng đơn hàng (không `DROP`, không quản trị).
   2. Tạo 2 bí mật mã hoá bằng KMS key riêng: `shopfast/prod/db-master` (chỉ Lambda xoay vòng đọc) và `shopfast/prod/db-app` (ứng dụng đọc).
   3. Bật xoay vòng 30 ngày bằng Lambda mẫu `SecretsManagerRDSPostgreSQLRotationMultiUser` (alternating users).
2. **Role cho EC2** (bước 3-4)
   1. Role `shopfast-prod-app-invoice` - trust chỉ `ec2.amazonaws.com` trong đúng tài khoản.
   2. Quyền: `s3:PutObject` trên `shopfast-prod-invoices/invoices/*`; `secretsmanager:GetSecretValue` trên đúng `shopfast/prod/db-app-??????`; `kms:Decrypt/GenerateDataKey` chỉ khi đi qua S3 / Secrets Manager; **Deny mọi thứ nếu credential EC2 được dùng ngoài VPC** `vpc-0a1b2c3d4e5f60718`.
   3. Launch template bắt buộc IMDSv2 (`HttpTokens=required`), `HttpPutResponseHopLimit=1`; user data **không** có khoá nào.
3. **Mã nguồn** (`src/`)
   1. Tạo client SDK **không** truyền credentials → chuỗi provider mặc định.
   2. Khởi động: từ chối chạy nếu thấy khoá dài hạn trong biến môi trường; ghi log danh tính (`sts:GetCallerIdentity`).
   3. Bí mật: cache 5 phút; lỗi `28P01` → lấy lại bí mật, dựng pool mới, thử lại 1 lần.
4. **Bẫy 1 - máy cá nhân lập trình viên** (bước 6)
   1. Permission set `ShopFastInvoiceDev` (IAM Identity Center), phiên 8 giờ: chỉ bucket `shopfast-dev-invoices` và bí mật `shopfast/dev/db-app`; **Deny tường minh** mọi thứ `shopfast/prod/*`.
   2. Lập trình viên: `aws sso login --profile shopfast-dev` rồi `npm run dev` (`.env.development` chỉ có tên profile và tên tài nguyên dev).
   3. Kết quả: không có key nào trên laptop; laptop bị mất → phiên tự hết sau 8 giờ, thu hồi bằng cách vô hiệu user SSO; không bao giờ chạm được dữ liệu prod.
5. **Bẫy 2 - tác vụ định kỳ ngoài cloud** (bước 5)
   1. Tạo CA nội bộ và chứng chỉ `CN=shopfast-invoice-cron` (`infra/pki/tao-chung-chi.sh`); khoá riêng `chmod 600`, chỉ user chạy cron đọc được.
   2. Đăng ký CA làm **trust anchor** của IAM Roles Anywhere; tạo profile + role `shopfast-prod-cron-invoice` mà trust policy yêu cầu đúng CN, đúng tổ chức, đúng trust anchor.
   3. Quyền của role như ứng dụng, thêm **Deny nếu không đến từ IP trung tâm dữ liệu** `203.0.113.0/28`.
   4. `~/.aws/config` dùng `credential_process = aws_signing_helper credential-process ...` → SDK nhận credential tạm 1 giờ, tự gọi lại khi hết hạn. Mã của job dùng chung module với ứng dụng.
   5. Gia hạn chứng chỉ hằng năm (nhắc trước 30 ngày); thu hồi khẩn cấp bằng CRL hoặc tắt trust anchor.
6. **Giám sát**: GuardDuty (phát hiện `InstanceCredentialExfiltration`), CloudTrail ghi mọi lời gọi `GetSecretValue`.
7. **Dọn dẹp**: xoá IAM user/access key cũ nếu đã từng dùng phương án (a).

## C2. Ứng dụng lấy thông tin xác thực như thế nào

```js
// src/aws-clients.js - không có dòng nào chứa khoá
import { S3Client } from '@aws-sdk/client-s3';
import { SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
assertNoLongTermKeys();
export const s3 = new S3Client({ region: config.region });
export const secretsManager = new SecretsManagerClient({ region: config.region });
```

Chuỗi provider mặc định của AWS SDK v3 cho Node.js thử lần lượt: biến môi trường → SSO → web identity token → file cấu hình (`credential_process`) → IMDS của EC2, và dừng ở nguồn đầu tiên có credential.

| Môi trường | Cấu hình bên ngoài | Nguồn SDK chọn | Danh tính (`npm run whoami`) |
|---|---|---|---|
| EC2 prod | instance profile, không biến `AWS_*` key | IMDSv2 | `assumed-role/shopfast-prod-app-invoice/i-0...` |
| Laptop dev | `AWS_PROFILE=shopfast-dev` | SSO token cache | `assumed-role/AWSReservedSSO_ShopFastInvoiceDev_.../ten-dev` |
| Máy ngoài cloud | `AWS_PROFILE=shopfast-onprem-cron` | `credential_process` → Roles Anywhere | `assumed-role/shopfast-prod-cron-invoice/<serial>` |

Bí mật CSDL (`src/secrets.js`, `src/db.js`):

```js
const dbSecret = new CachedSecret(secretsManager, config.dbSecretId, 5 * 60 * 1000);

export async function query(text, params) {
  const p = await buildPool();               // dùng bí mật trong cache
  try {
    return await p.query(text, params);
  } catch (err) {
    if (err.code !== '28P01') throw err;     // 28P01 = sai mật khẩu -> vừa xoay vòng
    const p2 = await buildPool(true);        // lấy AWSCURRENT mới, dựng pool mới
    return p2.query(text, params);
  }
}
```

Chạy:
```bash
# EC2 (user data đã đặt INVOICE_BUCKET, DB_SECRET_ID)
npm start
# Laptop
aws sso login --profile shopfast-dev && npm run dev
# Máy ngoài cloud (crontab)
AWS_PROFILE=shopfast-onprem-cron npm run job:nightly
```

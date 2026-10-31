# Bài tập 7 - Thiết lập quản trị truy cập cho đội ShopFast mở rộng

Tài khoản AWS: `123456789012`, vùng `ap-southeast-1`. Môi trường được phân biệt bằng **quy ước đặt tên** (`shopfast-dev-*` / `shopfast-prod-*`, log group `/shopfast/dev/*` / `/shopfast/prod/*`) và **thẻ** `Environment=dev|prod` cho tài nguyên EC2 (không đặt tên trong ARN được).

## Cấu trúc thư mục

```
ex3/
├── bao-cao.md                         # Phần A + kết quả phần B
├── iam-structure.json                 # Nhóm -> chính sách, người -> nhóm (nguồn sự thật duy nhất)
├── policies/
│   ├── ShopFast-SelfService.json      # tự quản lý mật khẩu / MFA / access key của chính mình
│   ├── ShopFast-Guardrails.json       # rào chắn chung: xoá prod phải có MFA, bảo vệ nhật ký
│   ├── ShopFast-Dev-ReadWrite.json    # đọc ghi tài nguyên dev
│   ├── ShopFast-Ops-PassRole.json     # bổ sung cho PowerUserAccess
│   ├── ShopFast-Data-AnalyticsRead.json
│   ├── ShopFast-Partner-LogRead.json  # 1 log group + hết hạn 90 ngày
│   ├── ShopFast-DenyAll.json          # dùng khi thu hồi quyền
│   └── aws-managed/                   # bản sao/trích lược chính sách AWS quản lý - chỉ để mô phỏng
├── roles/ShopFast-IamAdmin.{trust,permissions}.json
├── audit/                             # CloudTrail + bucket nhật ký
├── scripts/setup.sh | onboard.sh | offboard.sh | verify-offboard.sh
├── mo-phong.js, sim/iam-sim.js        # mô phỏng 46 tình huống
└── ket-qua-mo-phong.txt
```

---

# A. Báo cáo phân tích và thiết kế giải pháp

## A1. Phân tích bài toán (I/O)

**Đầu vào**
- 15 người, 5 vai trò công việc: 6 backend, 3 vận hành, 2 dữ liệu, 1 kế toán, 3 đối tác ngoài.
- Hai môi trường dev / prod trong cùng tài khoản; các dịch vụ: S3, EC2, Lambda, SQS, DynamoDB, RDS, CloudWatch Logs, Billing.
- Hiện trạng: tất cả dùng chung **một** IAM user có quyền quản trị.

**Đầu ra**
- Mỗi người một danh tính riêng, quyền đúng vai trò; mọi hành động truy vết được tới người cụ thể.
- Thao tác nguy hiểm (xoá trên prod) bị chặn bởi nhiều lớp.
- Quy trình cấp / thu hồi lặp lại được (script), thu hồi < 5 phút và có bằng chứng.

**Ma trận phân quyền**

| Vai trò (nhóm) | Số người | Dịch vụ được truy cập | Hành động được phép | Phạm vi tài nguyên | Điều kiện bổ sung |
|---|---|---|---|---|---|
| Lập trình viên backend (`Backend-Developers`) | 6 | S3, EC2, Lambda, SQS, DynamoDB, CloudWatch Logs | **Dev**: đọc + ghi + xoá (S3 object/bucket, Lambda, SQS, DynamoDB, Logs; Start/Stop/Reboot/Terminate EC2; tạo EC2); `iam:PassRole` role ứng dụng dev | `shopfast-dev-*`, `/shopfast/dev/*`, EC2 có thẻ `Environment=dev`, `role/shopfast-dev-app-*` | Tạo EC2 bắt buộc gắn `Environment=dev`; chỉ gắn thẻ lúc tạo (không đổi thẻ để "chiếm" máy prod); PassRole chỉ cho Lambda/EC2 |
| | | Mọi dịch vụ | **Prod**: chỉ đọc (`Get*`, `List*`, `Describe*`) | Toàn tài khoản | - |
| Kỹ sư vận hành (`Ops-Engineers`) | 3 | Mọi dịch vụ hạ tầng (trừ IAM, Organizations, Account) | Toàn quyền | Dev + prod | **Xoá trên prod** (S3, EC2, RDS, Lambda, SQS, DynamoDB, Logs) phải có `aws:MultiFactorAuthPresent=true` trong phiên hiện tại |
| | | IAM | `PassRole` role ứng dụng; đọc role; `AssumeRole` vào `ShopFast-IamAdmin` | `role/shopfast-*-app-*`, `role/ShopFast-IamAdmin` | Assume role: MFA tuổi < 1 giờ, thẻ `Team=ops`, phiên mang `SourceIdentity` = tên user |
| Kỹ sư dữ liệu (`Data-Engineers`) | 2 | S3 | `ListBucket`, `GetBucketLocation`, `GetObject`, `GetObjectVersion` | Chỉ bucket `shopfast-analytics` | Không gì khác (kể cả không thấy danh sách bucket) |
| Kế toán (`Accountants`) | 1 | Billing, Cost Explorer, Invoicing, Budgets | Chỉ xem | Toàn tài khoản | Root phải bật "IAM user and role access to Billing information" |
| Đối tác ngoài (`External-Partners`) | 3 | CloudWatch Logs | `DescribeLogStreams`, `GetLogEvents`, `FilterLogEvents` | Chỉ log group `/shopfast/prod/payment-gateway` | Hết hạn `2027-01-29T00:00:00Z` (90 ngày); sau hạn **Deny mọi thứ**; cấm tạo access key |
| Mọi người (`All-Staff`) | 15 | IAM (của chính mình) | Đổi mật khẩu, đăng ký/gỡ MFA (gỡ phải đang có MFA), quản lý access key của mình | `user/${aws:username}`, `mfa/${aws:username}` | Chịu rào chắn chung `ShopFast-Guardrails` |
| Role `ShopFast-IamAdmin` | (3 ops assume) | IAM | Vòng đời user: tạo, gắn thẻ, thêm/rút nhóm, xoá mật khẩu/key/MFA, gắn **duy nhất** `ShopFast-DenyAll` | `user/*`, `group/*`, `mfa/*` | Cấm sửa chính sách, nhóm, trust policy; permissions boundary = chính nó; phiên tối đa 1 giờ |
| Ứng dụng / pipeline | - | Theo từng ứng dụng | Theo từng ứng dụng | - | Dùng **Role** (`shopfast-*-app-*`, role CI/CD qua OIDC ở bài 6), không IAM user, không khoá dài hạn |

Áp dụng cho tất cả: **Cấm** tắt/sửa/xoá trail `shopfast-audit`, **cấm** xoá/sửa bucket `shopfast-audit-logs` (kể cả ops có MFA).

## A2. Đề xuất giải pháp

**Ý tưởng**: *người → nhóm → chính sách*. Không gắn chính sách trực tiếp vào user (trừ `ShopFast-DenyAll` khi thu hồi). Mỗi người thuộc nhóm nền `All-Staff` + **đúng một** nhóm công việc. Quyền "đặc thù vai trò" viết bằng **Allow** hẹp; điều "không ai được làm" viết bằng **Deny tường minh** trong một chính sách rào chắn dùng chung.

**6 nhóm**: `All-Staff`, `Backend-Developers`, `Ops-Engineers`, `Data-Engineers`, `Accountants`, `External-Partners`.

**Chính sách dùng sẵn (AWS quản lý)** - dùng khi AWS đã duy trì đúng phạm vi và tự cập nhật theo dịch vụ mới:
| Chính sách | Nhóm | Lý do |
|---|---|---|
| `ReadOnlyAccess` | Backend-Developers | "Chỉ đọc trên prod" bao trùm hàng trăm dịch vụ - tự viết sẽ thiếu sót và lạc hậu |
| `PowerUserAccess` | Ops-Engineers | "Toàn quyền hạ tầng" nhưng **loại IAM/Organizations** → ops không tự nâng quyền, không gỡ được rào chắn của chính mình |
| `AWSBillingReadOnlyAccess` | Accountants | Đúng nghiệp vụ xem chi phí, hoá đơn |

**Chính sách tự viết** - khi phạm vi gắn với tên/thẻ tài nguyên của ShopFast: `ShopFast-SelfService`, `ShopFast-Guardrails`, `ShopFast-Dev-ReadWrite`, `ShopFast-Ops-PassRole`, `ShopFast-Data-AnalyticsRead`, `ShopFast-Partner-LogRead`, `ShopFast-DenyAll`, `ShopFast-IamAdmin-Permissions`.

**Chỗ dùng Role thay cho người dùng**
1. **Quản trị IAM** (`ShopFast-IamAdmin`): không ai có quyền IAM thường trực. Ops phải *assume* role (MFA mới, thẻ `Team=ops`, ghi `SourceIdentity`) để cấp / thu hồi → mỗi thao tác IAM có dấu vết "ai, lúc nào"; phiên tự hết sau 1 giờ; boundary ngăn role tự nới quyền kể cả khi bị gắn thêm inline policy.
2. **Ứng dụng chạy trên EC2/Lambda**: role `shopfast-dev-app-*` / `shopfast-prod-app-*`, được chuyển giao qua `iam:PassRole` có giới hạn - lập trình viên không thể gán role prod cho Lambda dev của mình.
3. **Pipeline CI/CD**: role OIDC (bài 6) - không có IAM user "máy" nào.

**Truy vết**: mỗi người một IAM user (tài khoản admin dùng chung bị khoá), CloudTrail đa vùng + xác thực toàn vẹn file log, ghi cả data event S3 trên bucket prod và phân tích, bucket nhật ký có Object Lock COMPLIANCE 365 ngày + bucket policy cấm xoá, rào chắn cấm tắt trail.

**Nhiều lớp cho thao tác nguy hiểm (xoá prod)**
1. Chỉ nhóm Ops có Allow xoá (lớp đặc quyền tối thiểu).
2. Deny tường minh nếu phiên không có MFA (lớp xác thực).
3. Nhật ký không thể bị xoá / tắt (lớp truy vết - biết chắc ai đã xoá).

## A3. Thiết kế các bước

### Quy trình cấp quyền cho nhân viên mới (`scripts/onboard.sh`)

1. Quản lý trực tiếp tạo yêu cầu (ticket) ghi rõ: tên, vai trò, (đối tác: ngày hết hạn).
2. Thêm dòng người dùng vào `iam-structure.json` qua Pull Request; trưởng nhóm vận hành duyệt PR (người duyệt ≠ người yêu cầu).
3. Một kỹ sư vận hành assume role `ShopFast-IamAdmin` (MFA) và chạy `bash scripts/onboard.sh <user>`:
   1. Script kiểm tra user có trong file đã duyệt và thuộc **đúng một** nhóm công việc - sai thì dừng.
   2. Tạo IAM user với thẻ `Team`, `CreatedBy`, `Ticket` (+ `AccessExpiresOn` cho đối tác).
   3. Thêm vào `All-Staff` + nhóm công việc. Không gắn chính sách trực tiếp.
   4. Tạo mật khẩu tạm, bắt buộc đổi ở lần đăng nhập đầu; gửi qua kênh riêng.
4. Người dùng đăng nhập, đổi mật khẩu, tự đăng ký MFA.
5. Kiểm tra: `aws iam simulate-principal-policy` với vài hành động của vai trò; đóng ticket.
6. Đối tác: đặt lịch chạy `offboard.sh` vào ngày hết hạn (dự phòng - quyền vốn đã tự tắt theo `aws:CurrentTime`).

### Quy trình thu hồi quyền khi nghỉ việc (`scripts/offboard.sh` - mục tiêu < 5 phút)

| Bước | Hành động | Đường truy cập bị đóng |
|---|---|---|
| 1 | Gắn `ShopFast-DenyAll` (Deny `*`) | **Mọi request ngay lập tức**: phiên console đang mở, access key chưa xoá, token tạm từ `GetSessionToken` - Deny tường minh thắng mọi Allow từ nhóm |
| 2 | Xoá login profile | Đăng nhập console mới |
| 3 | Vô hiệu + xoá mọi access key | CLI/SDK |
| 4 | Gỡ MFA, SSH key, credential dịch vụ, chứng chỉ ký | CodeCommit, đăng nhập lại |
| 5 | Rút khỏi mọi nhóm | Quyền gốc |
| 6 | Nếu là Ops: gắn `AWSRevokeOlderSessions` (Deny khi `aws:TokenIssueTime` < bây giờ) vào `ShopFast-IamAdmin` | Phiên role đã assume trước đó - **không** bị bước 1 ảnh hưởng vì credential của role là của role |
| 7 | Gắn thẻ `Status=offboarded`; **giữ** user (không xoá) | Lịch sử CloudTrail vẫn khớp đúng danh tính |
| 8 | Chạy `verify-offboard.sh` | Bằng chứng |

`verify-offboard.sh` kiểm 8 "đường": mật khẩu console, access key, MFA/SSH/credential dịch vụ/chứng chỉ, nhóm/chính sách, role tin cậy trực tiếp user, resource policy (IAM Access Analyzer), mô phỏng quyền hiệu lực (tất cả phải `explicitDeny`), CloudTrail sau thời điểm thu hồi.

Toàn bộ bước 1-7 là ~15-25 lệnh API, chạy dưới 1 phút; bước 1 đã cắt toàn bộ truy cập trong vài giây (độ trễ lan truyền của IAM).

---

# B. Triển khai và chống lỗi

## B1. Tệp chính sách JSON - đối chiếu ma trận

| Dòng ma trận | Tệp | Statement chính |
|---|---|---|
| Backend - dev đọc ghi | `ShopFast-Dev-ReadWrite.json` | `DevBucketsAndObjects`, `DevNamedServiceResources`, `Ec2ManageDevInstances`, `Ec2LaunchOnlyTaggedDev`, `Ec2TagOnlyAtLaunch`, `PassOnlyDevAppRoles` |
| Backend - prod chỉ đọc | AWS `ReadOnlyAccess` | - |
| Ops - toàn quyền | AWS `PowerUserAccess` + `ShopFast-Ops-PassRole.json` | `PassApplicationRolesOnly`, `AssumeIamAdminRole` |
| Ops - xoá prod cần MFA | `ShopFast-Guardrails.json` | `DenyProdDeleteWithoutMfaNamedResources`, `DenyProdEc2DeleteWithoutMfaTaggedResources` |
| Data | `ShopFast-Data-AnalyticsRead.json` | `ListAnalyticsBucket`, `ReadAnalyticsObjects` |
| Kế toán | AWS `AWSBillingReadOnlyAccess` | - |
| Đối tác | `ShopFast-Partner-LogRead.json` | `ReadPaymentGatewayLogsUntilExpiry`, `DenyEverythingAfterExpiry`, `DenyLongTermKeysForPartners` |
| Mọi người | `ShopFast-SelfService.json`, `ShopFast-Guardrails.json` | `ProtectAuditTrail`, `ProtectAuditBucket` |
| Quản trị IAM | `roles/ShopFast-IamAdmin.*.json` | `AttachOnlyTheOffboardingDenyPolicy`, `NeverTouchGuardrailsOrThisRolesDefinition` |
| Truy vết | `audit/*.json`, `scripts/setup.sh` bước 1 | trail đa vùng + data events + Object Lock |

Điểm đáng chú ý trong cách viết:
- `BoolIfExists aws:MultiFactorAuthPresent = false`: dùng `IfExists` để request **bằng access key dài hạn** (không có khoá này trong ngữ cảnh) cũng bị coi là "không MFA" và bị chặn. Nếu viết `Bool` thì request bằng access key sẽ **lọt** qua Deny.
- Ops muốn xoá prod qua CLI: `aws sts get-session-token --serial-number <mfa-arn> --token-code <otp>` rồi dùng credential tạm đó.
- Dev không thể "đổi thẻ" máy prod thành dev để huỷ: `ec2:CreateTags` chỉ được phép khi `ec2:CreateAction = RunInstances` (tức gắn thẻ lúc tạo).
- Tài nguyên prod của EC2 chưa gắn thẻ sẽ không được rào chắn MFA bảo vệ → bổ sung Tag Policy / AWS Config rule `required-tags` để phát hiện.

## B2. Cấu hình chặn từng bẫy dữ liệu

### Bẫy 1 - Nhân viên nghỉ việc: thu hồi toàn bộ < 5 phút, chứng minh không còn đường truy cập
- `ShopFast-DenyAll` + `scripts/offboard.sh` (bước 1 có hiệu lực tức thì, các bước sau dọn sạch credential).
- Phiên role đã assume trước khi nghỉ: `AWSRevokeOlderSessions` theo `aws:TokenIssueTime` (bước 6).
- Bằng chứng: `scripts/verify-offboard.sh` + tình huống mô phỏng 38-39.
- `ShopFast-IamAdmin` chỉ được gắn **đúng** `ShopFast-DenyAll` vào user (điều kiện `iam:PolicyARN`), không thể lợi dụng quyền thu hồi để cấp quyền (tình huống 41-42).

### Bẫy 2 - Một người thuộc hai nhóm có quyền mâu thuẫn
Kết quả cuối cùng **xác định được** theo logic đánh giá của IAM:
1. Quyền hiệu lực = **hợp** các Allow của mọi nhóm (Allow không "triệt tiêu" nhau).
2. Bất kỳ **Deny tường minh** nào khớp → bị chặn, bất kể bao nhiêu Allow.
3. Không có Allow nào → Deny ngầm định.

Thiết kế giúp kết quả **giải thích được**:
- "Quyền hạn chế" của từng vai trò được diễn đạt bằng **không cấp** (Deny ngầm định), không bằng Deny riêng của nhóm → người ở hai nhóm nhận đúng hợp quyền, không có Deny "lạc" từ nhóm này chặn nghiệp vụ của nhóm kia.
- Chỉ dùng Deny tường minh cho **rào chắn áp dụng cho mọi người** (MFA khi xoá prod, bảo vệ nhật ký, hết hạn đối tác) → các rào chắn luôn thắng dù người đó thuộc bao nhiêu nhóm.
- Phòng ngừa: `onboard.sh` từ chối nếu một người thuộc khác 1 nhóm công việc; ngoại lệ phải được duyệt.

| Kết hợp | Thao tác | Kết quả | Giải thích |
|---|---|---|---|
| Dev + Data | Đọc `shopfast-analytics` | ALLOW | Hợp Allow: Data cho phép |
| Dev + Data | Ghi bucket prod | DENY (ngầm định) | Không nhóm nào Allow |
| Dev + Ops | Ghi bucket prod | ALLOW | PowerUserAccess của Ops cho phép; nhóm Dev không có Deny nào cản |
| Dev + Ops | Huỷ máy prod không MFA | DENY (tường minh) | Rào chắn MFA thắng Allow của Ops |
| Ops + Partner (sau hạn) | Tạo máy chủ | DENY (tường minh) | `DenyEverythingAfterExpiry` của nhóm đối tác thắng mọi Allow - người lỡ bị thêm vào nhóm đối tác sẽ mất hết quyền khi hết hạn |

### Bẫy phụ đã xử lý
- Tiền tố `shopfast-dev-` có dấu `-` (không khớp `shopfast-devops-*`).
- Đối tác: `DateLessThan` cho Allow **và** `DateGreaterThanEquals` cho Deny `*` → kể cả quyền tự phục vụ của `All-Staff` cũng tắt khi hết hạn; cấm tạo access key để không có credential dài hạn ra ngoài công ty.
- Ops không có quyền IAM thường trực → không thể tự gỡ rào chắn.
- `ShopFast-IamAdmin` có permissions boundary = chính nó → dù gắn thêm inline policy bằng `PutRolePolicy` cũng không vượt được (Deny sửa chính sách, nhóm, trust policy luôn giữ).

## B3. Kết quả mô phỏng (46 tình huống)

Chạy `node mo-phong.js` - kết quả chi tiết (kèm statement quyết định) trong `ket-qua-mo-phong.txt`. Thời điểm mặc định `2026-11-15T09:00:00Z`; "sau hạn" = `2027-02-01`.

| # | Người | Tình huống | Kết quả |
|---|---|---|---|
| 1 | dev-an | Ghi object vào bucket dev | ALLOW |
| 2 | dev-an | Ghi object vào bucket prod | DENY (ngầm định) |
| 3 | dev-an | Đọc object bucket prod | ALLOW |
| 4 | dev-an | Huỷ máy chủ gắn thẻ dev | ALLOW |
| 5 | dev-an | Huỷ máy chủ gắn thẻ prod | DENY (tường minh - rào chắn MFA) |
| 6 | dev-an | Huỷ máy chủ prod kể cả có MFA | DENY (ngầm định - không có quyền) |
| 7 | dev-an | Tạo máy chủ gắn thẻ prod | DENY (ngầm định) |
| 8 | dev-an | Gán role ứng dụng prod cho Lambda | DENY (ngầm định) |
| 9 | dev-an | Cập nhật Lambda dev | ALLOW |
| 10 | ops-khanh | Tạo máy chủ prod | ALLOW |
| 11 | ops-khanh | Huỷ máy chủ prod **không** MFA | DENY (tường minh) |
| 12 | ops-khanh | Huỷ máy chủ prod **có** MFA | ALLOW |
| 13 | ops-khanh | Xoá bucket sao lưu prod không MFA | DENY (tường minh) |
| 14 | ops-khanh | Xoá bucket sao lưu prod có MFA | ALLOW |
| 15 | ops-khanh | Xoá bucket dev không MFA | ALLOW |
| 16 | ops-khanh | Tự gắn AdministratorAccess | DENY (ngầm định) |
| 17 | ops-khanh | Tắt CloudTrail (có MFA) | DENY (tường minh) |
| 18 | ops-khanh | Xoá file nhật ký kiểm toán | DENY (tường minh) |
| 19 | data-nam | Đọc dữ liệu phân tích | ALLOW |
| 20 | data-nam | Ghi vào bucket phân tích | DENY (ngầm định) |
| 21 | data-nam | Đọc dữ liệu khách hàng prod | DENY (ngầm định) |
| 22 | data-nam | Xem danh sách máy chủ | DENY (ngầm định) |
| 23 | ketoan-phuong | Xem chi phí theo dịch vụ | ALLOW |
| 24 | ketoan-phuong | Xem hoá đơn | ALLOW |
| 25 | ketoan-phuong | Sửa phương thức thanh toán | DENY (ngầm định) |
| 26 | ketoan-phuong | Đọc bucket dev | DENY (ngầm định) |
| 27 | partner-quang | Đọc log payment-gateway (còn hạn) | ALLOW |
| 28 | partner-quang | Đọc log order-service | DENY (ngầm định) |
| 29 | partner-quang | Đọc log payment-gateway sau 90 ngày | DENY (tường minh) |
| 30 | partner-quang | Đổi mật khẩu sau 90 ngày | DENY (tường minh) |
| 31 | partner-quang | Tự tạo access key dài hạn | DENY (tường minh) |
| 32-37 | (hai nhóm) | Xem bảng ở Bẫy 2 | như bảng |
| 38 | dev-hoa (đã thu hồi) | Đọc bucket dev | DENY (tường minh) |
| 39 | dev-hoa (đã thu hồi) | Tạo access key mới | DENY (tường minh) |
| 40 | role IamAdmin | Thêm user vào nhóm | ALLOW |
| 41 | role IamAdmin | Gắn `ShopFast-DenyAll` cho user nghỉ | ALLOW |
| 42 | role IamAdmin | Gắn `AdministratorAccess` cho user | DENY (ngầm định) |
| 43 | role IamAdmin | Sửa chính sách Guardrails | DENY (tường minh) |
| 44 | ops-khanh | Assume IamAdmin có MFA | ALLOW |
| 45 | ops-khanh | Assume IamAdmin không MFA | DENY (trust policy) |
| 46 | dev-an | Assume IamAdmin | DENY |

Kết quả: **46/46 tình huống đúng như thiết kế.** Trên AWS thật, kiểm chứng lại từng tình huống bằng `aws iam simulate-principal-policy --policy-source-arn arn:aws:iam::123456789012:user/<user> --action-names <action> --resource-arns <arn> --context-entries ...`.

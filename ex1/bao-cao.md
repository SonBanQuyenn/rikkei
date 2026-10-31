# Bài tập 5 - Vá lỗi chính sách IAM cấp quyền quá rộng

## Các tệp trong bài

| Tệp | Nội dung |
|---|---|
| `policy-cu.json` | Chính sách đang gắn cho nhóm `shopfast-developer` (hiện trường) |
| `policy-moi.json` | Phần 2 - chính sách đã sửa theo nguyên tắc đặc quyền tối thiểu |
| `mo-phong.js` | Chạy cùng một bộ tình huống trên chính sách cũ và mới (`node mo-phong.js`) |
| `ket-qua-mo-phong.txt` | Kết quả mô phỏng đã chạy |
| `sim/iam-sim.js` | Bộ mô phỏng rút gọn logic đánh giá chính sách IAM (Deny tường minh > Allow > Deny ngầm định) |

Quy tắc đúng (bối cảnh nghiệp vụ): nhóm lập trình viên **chỉ** được
1. đọc/ghi **đối tượng** trong các bucket có tiền tố `shopfast-dev-`,
2. **xem danh sách** máy chủ,
3. **tuyệt đối không** thao tác gì với IAM.

---

## Phần 1 - Chỉ ra lỗi bằng dữ liệu

### Đọc phạm vi thực tế của chính sách cũ

| Statement | Action | Resource | Phạm vi thực tế |
|---|---|---|---|
| `DeveloperAccess` | `s3:*` | `*` | **Mọi** hành động S3 (hơn 100 action: xoá bucket, xoá object, sửa bucket policy, ACL, lifecycle, tắt versioning...) trên **mọi** bucket trong tài khoản - cả dev lẫn production. |
| `ViewInfrastructure` | `ec2:*` | `*` | **Mọi** hành động EC2: chạy, dừng, huỷ máy chủ, sửa security group, xoá snapshot/volume... Tên Sid "View" là sai lệch - không có chữ "chỉ xem" nào trong chính sách. |
| `ViewInfrastructure` | `iam:*` | `*` | Toàn quyền quản lý truy cập = tương đương **quản trị viên tài khoản**, vì ai sửa được IAM thì tự cấp được mọi quyền còn lại. |

Ba "điểm mù" khi đọc chính sách:
- **Ký tự đại diện trong Action** (`s3:*`, `ec2:*`): không phải "quyền làm việc với S3" mà là *tất cả* các thao tác, kể cả phá huỷ.
- **Ký tự đại diện trong Resource** (`*`): không phân biệt dev và production, không phân biệt bucket với object.
- **Cấp `iam:*`**: là cánh cửa leo thang đặc quyền - mọi giới hạn khác trở nên vô nghĩa.

### Các khiếm khuyết và tình huống minh hoạ

| # | Khiếm khuyết | Tình huống cụ thể (kẻ xấu hoặc người dùng bất cẩn) | Mô phỏng |
|---|---|---|---|
| KK1 | `s3:*` cho phép **xoá** (`s3:DeleteBucket`, `s3:DeleteObject`, `s3:PutLifecycleConfiguration`...) | Lập trình viên chạy script dọn dẹp `aws s3 rb s3://shopfast-prod-db-backup --force` vì tưởng đang ở profile dev → mất toàn bộ bản sao lưu CSDL sản xuất. **Đây chính là sự cố kiểm toán phát hiện.** | TH5, TH6 |
| KK2 | `Resource: "*"` không giới hạn môi trường → đọc được dữ liệu production | Laptop của một lập trình viên bị nhiễm mã độc đánh cắp access key; kẻ tấn công `aws s3 sync s3://shopfast-prod-customer-data .` và lấy toàn bộ dữ liệu khách hàng. | TH7 |
| KK3 | `s3:*` gồm cả thao tác **cấu hình bucket** (`s3:PutBucketPolicy`, `s3:PutBucketAcl`, `s3:DeleteBucket`) - quy tắc chỉ cho đọc/ghi *đối tượng* | Lập trình viên muốn chia sẻ nhanh file test nên đặt bucket policy `Principal: "*"` → bucket bị công khai ra Internet; hoặc xoá luôn bucket dev dùng chung của cả nhóm. | TH8, TH9 |
| KK4 | `iam:*` → **leo thang đặc quyền** | Lập trình viên tự chạy `aws iam attach-user-policy --user-name dev-an --policy-arn arn:aws:iam::aws:policy/AdministratorAccess` mà không ai phê duyệt (**sự cố thứ hai**); kẻ xấu có key thì tạo user "cửa hậu" hoặc tạo access key cho tài khoản admin khác để giữ quyền lâu dài kể cả khi key gốc bị thu hồi. | TH10, TH11, TH12 |
| KK5 | `ec2:*` trong khi nghiệp vụ chỉ cần **xem danh sách** máy chủ | Kẻ xấu `ec2:TerminateInstances` toàn bộ máy chủ production, hoặc `ec2:RunInstances` hàng chục máy GPU để đào tiền ảo; người bất cẩn mở security group CSDL ra `0.0.0.0/0`. | TH13, TH14 |
| KK6 | Không có Deny tường minh cho IAM | Nếu sau này ai đó gắn thêm một chính sách khác có `iam:*` cho nhóm (hoặc cho từng user), quyền lại mở ra - không có "chốt chặn" nào thắng được Allow. | TH10-TH12 (chính sách mới chặn bằng Deny tường minh) |

---

## Phần 2 - Chính sách đã sửa (`policy-moi.json`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ListObjectsInDevBuckets",
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:GetBucketLocation"],
      "Resource": "arn:aws:s3:::shopfast-dev-*"
    },
    {
      "Sid": "ReadWriteObjectsInDevBuckets",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::shopfast-dev-*/*"
    },
    {
      "Sid": "ViewServerList",
      "Effect": "Allow",
      "Action": ["ec2:DescribeInstances", "ec2:DescribeInstanceStatus"],
      "Resource": "*"
    },
    {
      "Sid": "DenyAllIam",
      "Effect": "Deny",
      "Action": "iam:*",
      "Resource": "*"
    }
  ]
}
```

Giải thích từng quyết định:

| Quyết định | Lý do |
|---|---|
| Liệt kê **đúng** action `s3:GetObject`, `s3:PutObject` | "Đọc ghi đối tượng" - không có `s3:Delete*`, không có thao tác cấu hình bucket (`PutBucketPolicy`, `PutBucketAcl`, `DeleteBucket`...). Khắc phục KK1, KK3. |
| Tách hai Resource: bucket `shopfast-dev-*` và object `shopfast-dev-*/*` | Action cấp object chỉ áp lên ARN object (`bucket/*`); `s3:ListBucket` chỉ áp lên ARN bucket. Lập trình viên cần liệt kê để biết có object nào mà đọc. Không cấp `s3:ListAllMyBuckets` → không nhìn thấy tên các bucket production. |
| Tiền tố `shopfast-dev-*` **có dấu gạch ngang** | Nếu viết `shopfast-dev*` thì khớp cả `shopfast-devops-secrets`, `shopfast-device-prod`... (TH15). Dấu `-` neo đúng ranh giới tiền tố. Khắc phục KK2. |
| `ec2:DescribeInstances`, `ec2:DescribeInstanceStatus` với `Resource: "*"` | Chỉ là thao tác đọc danh sách. Các action `Describe*` của EC2 **không hỗ trợ giới hạn theo resource**, nên bắt buộc là `*` - nhưng vì chỉ đọc nên không gây hại. Khắc phục KK5. |
| `Deny iam:*` tường minh | Quy tắc "tuyệt đối không" → dùng Deny tường minh vì Deny luôn thắng mọi Allow ở chính sách khác gắn vào user/nhóm (khắc phục KK4, KK6). |

Ngoài chính sách, cần làm thêm khi triển khai: gỡ `policy-cu.json` khỏi nhóm, rà soát CloudTrail các sự kiện `AttachUserPolicy`/`CreateAccessKey`/`CreateUser` của nhóm developer trong thời gian qua và **gỡ bỏ quyền admin mà lập trình viên đã tự cấp** (chính sách mới không tự thu hồi quyền đã gắn trực tiếp vào user - nhưng Deny `iam:*` vẫn chặn việc cấp tiếp).

---

## Kết quả mô phỏng

Chạy: `node mo-phong.js` (kết quả đầy đủ trong `ket-qua-mo-phong.txt`).

| ID | Tình huống | Chính sách CŨ | Chính sách MỚI |
|---|---|---|---|
| TH1 | Đọc object trong bucket dev | ALLOW | ALLOW |
| TH2 | Ghi object vào bucket dev | ALLOW | ALLOW |
| TH3 | Liệt kê object trong bucket dev | ALLOW | ALLOW |
| TH4 | Xem danh sách máy chủ | ALLOW | ALLOW |
| TH5 | [KK1] Xoá bucket sao lưu CSDL production | ALLOW | DENY (ngầm định) |
| TH6 | [KK1] Xoá file sao lưu CSDL production | ALLOW | DENY (ngầm định) |
| TH7 | [KK2] Tải dữ liệu khách hàng production | ALLOW | DENY (ngầm định) |
| TH8 | [KK3] Sửa bucket policy để công khai bucket | ALLOW | DENY (ngầm định) |
| TH9 | [KK3] Xoá chính bucket dev | ALLOW | DENY (ngầm định) |
| TH10 | [KK4] Tự gắn AdministratorAccess cho mình | ALLOW | DENY (tường minh) |
| TH11 | [KK4] Tạo access key cho user khác | ALLOW | DENY (tường minh) |
| TH12 | [KK4] Tạo user "cửa hậu" | ALLOW | DENY (tường minh) |
| TH13 | [KK5] Huỷ máy chủ production | ALLOW | DENY (ngầm định) |
| TH14 | [KK5] Mở security group ra 0.0.0.0/0 | ALLOW | DENY (ngầm định) |
| TH15 | [Bẫy tiền tố] Đọc bucket `shopfast-devops-secrets` | ALLOW | DENY (ngầm định) |

Kết luận: 4 thao tác hợp lệ (TH1-TH4) vẫn được phép; cả 11 thao tác nguy hiểm mà chính sách cũ cho phép đều bị chặn ở chính sách mới.

Có thể kiểm chứng lại trên AWS thật bằng IAM Policy Simulator:

```bash
aws iam simulate-custom-policy \
  --policy-input-list file://policy-moi.json \
  --action-names s3:DeleteBucket s3:GetObject iam:AttachUserPolicy ec2:TerminateInstances \
  --resource-arns "arn:aws:s3:::shopfast-prod-db-backup" \
  --query "EvaluationResults[].[EvalActionName,EvalDecision]" --output table
```

# Bài tập 6 - Điền khuyết Role cho pipeline CI/CD

## Các tệp trong bài

| Tệp | Nội dung |
|---|---|
| `trust-policy.json` | Quan hệ tin cậy của Role `shopfast-backend-ecr-push` - đã điền chỗ khuyết (1)-(4) |
| `permission-policy.json` | Chỗ khuyết (5) - chính sách quyền tối thiểu để đẩy image lên ECR |
| `.github/workflows/build-push.yml` | Cấu hình pipeline dùng Role qua OIDC thay cho khoá truy cập dài hạn |

Quy tắc đúng: chỉ pipeline chạy trên kho mã `shopfast/backend`, **chỉ ở nhánh `main`**, mới đảm nhận được Role để đẩy image; không dùng khoá truy cập dài hạn.

Vì sao cấu hình hiện tại nguy hiểm: trust policy chỉ có `Principal` là nhà cung cấp OIDC của GitHub (`token.actions.githubusercontent.com`). Nhà cung cấp này cấp token cho **mọi** workflow của **mọi** kho mã trên github.com. Không có `Condition` nghĩa là bất kỳ ai tạo một kho mã công khai, viết workflow gọi `AssumeRoleWithWebIdentity` với ARN Role của ShopFast là nhận được thông tin xác thực và đẩy image độc hại.

---

## Trust policy hoàn chỉnh (`trust-policy.json`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "GitHubActionsShopfastBackendMainOnly",
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::123456789012:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:shopfast/backend:ref:refs/heads/main"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:shopfast/backend:*"
        }
      }
    }
  ]
}
```

| Chỗ khuyết | Đã điền | Giải thích |
|---|---|---|
| `<nha-cung-cap>` | `token.actions.githubusercontent.com` | Nhà cung cấp OIDC của GitHub Actions (phải tạo IAM OIDC provider với URL `https://token.actions.githubusercontent.com`, audience `sts.amazonaws.com`). |
| (1) Khối `Condition` | Có khối `Condition` với hai toán tử `StringEquals` và `StringLike` | Không có `Condition` = tin mọi token do GitHub phát hành. Các điều kiện trong một statement được **AND** với nhau, nên token phải thoả **tất cả**. |
| (2) Đối tượng nhận token | `token.actions.githubusercontent.com:aud` = `sts.amazonaws.com` | Token phải được phát hành **dành cho AWS STS**. Chặn việc lấy token GitHub phát cho dịch vụ khác (audience khác) đem sang AWS dùng lại. |
| (3) Đúng tổ chức và kho mã | `StringLike` `sub` = `repo:shopfast/backend:*` | Phần định danh được **neo chặt từ đầu chuỗi**: bắt đầu bằng `repo:`, đúng tổ chức `shopfast`, dấu `/`, đúng kho `backend`, rồi **dấu `:`** kết thúc tên kho. Ký tự đại diện chỉ nằm ở phần đuôi (loại sự kiện). |
| (4) Đúng nhánh `main` | `StringEquals` `sub` = `repo:shopfast/backend:ref:refs/heads/main` | So sánh **chính xác tuyệt đối** (không có ký tự đại diện) → chỉ workflow chạy từ `refs/heads/main` khớp. Nhánh khác, tag, pull request (`...:pull_request`) đều không khớp. |

> Ghi chú: (4) đã bao hàm (3), nhưng giữ cả hai để mỗi yêu cầu có một điều kiện riêng, đọc - kiểm tra - sửa độc lập (ví dụ sau này cho thêm nhánh `release/*` thì chỉ sửa (4), điều kiện tổ chức/kho mã vẫn chốt chặn).
>
> Theo tài liệu `aws-actions/configure-aws-credentials`, các kho mã tạo từ 15/07/2026 (hoặc đã bật / đã đổi tên) phát `sub` dạng **bất biến** kèm ID số: `repo:shopfast@<ORG_ID>/backend@<REPO_ID>:ref:refs/heads/main`. Khi đó thay giá trị (3), (4) theo dạng này - còn chặt hơn vì kẻ xấu không thể chiếm lại tên tổ chức/kho mã đã bị xoá hoặc đổi tên.

## (5) Chính sách quyền của Role (`permission-policy.json`)

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "EcrLogin",
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Sid": "PushImageToBackendRepoOnly",
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:InitiateLayerUpload",
        "ecr:UploadLayerPart",
        "ecr:CompleteLayerUpload",
        "ecr:PutImage"
      ],
      "Resource": "arn:aws:ecr:ap-southeast-1:123456789012:repository/shopfast/backend"
    }
  ]
}
```

| Action | Vai trò trong `docker push` |
|---|---|
| `ecr:GetAuthorizationToken` | Lấy mật khẩu đăng nhập registry (`docker login`). Action này không gắn với kho cụ thể nên AWS chỉ chấp nhận `Resource: "*"`; bản thân nó không cho đọc/ghi image nào. |
| `ecr:BatchCheckLayerAvailability` | Kiểm tra layer nào đã có sẵn để bỏ qua. |
| `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload` | Tải từng layer lên. |
| `ecr:PutImage` | Ghi manifest + tag của image. |

Những gì **không** cấp: `ecr:*`, `ecr:DeleteRepository`, `ecr:BatchDeleteImage`, `ecr:SetRepositoryPolicy`, `ecr:PutLifecyclePolicy`, quyền trên kho mã khác (`Resource` chỉ đúng `repository/shopfast/backend`, không có ký tự đại diện).

---

## Cấu hình pipeline (`.github/workflows/build-push.yml`)

Điểm chính:
- `on.push.branches: [main]` - chỉ chạy trên `main` (lớp chặn phía GitHub). Lớp chặn quyết định vẫn là trust policy phía AWS, vì ai có quyền ghi workflow ở nhánh khác vẫn có thể tự sửa trigger.
- `permissions: id-token: write` - cho phép job xin OIDC token; `contents: read` để checkout. Không cấp quyền thừa.
- `aws-actions/configure-aws-credentials` với `role-to-assume` - đổi OIDC token lấy thông tin xác thực **tạm thời** (mặc định 1 giờ). Không có `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` nào trong GitHub Secrets → không có gì để lộ, không cần xoay vòng khoá.
- Không dùng `environment:` trong job vì khi đó `sub` trở thành `repo:shopfast/backend:environment:<tên>` và không khớp (4).

Sau khi chuyển sang OIDC: xoá IAM user/access key cũ mà pipeline đang dùng.

---

## Bẫy dữ liệu

### Bẫy 1 - ký tự đại diện không neo đầu chuỗi

Một cách viết sai thường gặp:

```json
"StringLike": { "token.actions.githubusercontent.com:sub": "*shopfast*/backend*" }
```

| Giá trị `sub` của token | Cách viết sai | Trust policy đã sửa |
|---|---|---|
| `repo:shopfast/backend:ref:refs/heads/main` (hợp lệ) | ALLOW | ALLOW |
| `repo:shopfast/backend:ref:refs/heads/dev` (sai nhánh) | ALLOW | DENY |
| `repo:shopfast/backend:pull_request` (PR, kể cả từ fork) | ALLOW | DENY |
| `repo:shopfast-evil/backend:ref:refs/heads/main` (tổ chức tên gần giống) | ALLOW | DENY |
| `repo:attacker/shopfast/backend:ref:...` (chèn chuỗi) | ALLOW | DENY |
| `repo:shopfast/backend-fork:ref:refs/heads/main` (kho tên gần giống) | ALLOW | DENY |
| `repo:shopfast/backend:environment:prod` | ALLOW | DENY |
| `aud` khác `sts.amazonaws.com` | (không kiểm tra) | DENY |

Kẻ xấu chỉ cần tạo tổ chức `shopfast-evil` (hoặc `xshopfast`...) và kho `backend` là khớp pattern sai. Cách sửa: viết đầy đủ từ `repo:` + tên tổ chức + `/` + tên kho + `:`, ký tự đại diện chỉ được phép ở phần sau dấu `:` cuối tên kho - và ở (4) không dùng ký tự đại diện nào.

### Bẫy 2 - chính sách quyền cấp toàn quyền trên kho lưu trữ container

Nếu (5) viết `"Action": "ecr:*", "Resource": "*"` thì một workflow bị chiếm quyền (ví dụ qua dependency độc hại trong lúc build) có thể xoá image production đang chạy (`ecr:BatchDeleteImage`), xoá cả kho (`ecr:DeleteRepository`), sửa repository policy để mở kho cho tài khoản lạ, hoặc ghi đè image của **các dịch vụ khác**. Chính sách đã sửa chỉ gồm 6 action cần cho `docker push`, và chỉ trên đúng kho `shopfast/backend`.

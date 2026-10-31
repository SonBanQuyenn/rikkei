# Runbook - Thao tác phá huỷ dữ liệu trên prod (BreakGlass)

Dùng khi **bắt buộc** phải xoá / thay thế dữ liệu trên prod: xoá bảng sai cấu trúc, xoá bucket đã ngừng dùng, xoá snapshot chứa dữ liệu phải huỷ theo yêu cầu pháp lý...

## Các lớp kiểm soát mà yêu cầu phải đi qua
| Lớp | Cơ chế | Ai/cái gì chặn nếu thiếu |
|---|---|---|
| 1. Đặc quyền tối thiểu | Không vai trò thường trực nào có quyền xoá dữ liệu prod (Operator chỉ vận hành) | Deny ngầm định |
| 2. Hai người duyệt + hẹn giờ | BreakGlass chỉ được gán bởi người thuộc `shopfast-security`, khác người xin, tối đa 120 phút, tự gỡ bằng EventBridge Scheduler | `break-glass.sh` từ chối; không ai khác có quyền `sso:CreateAccountAssignment` |
| 3. Rào chắn tổ chức (SCP) | `OnlyBreakGlassMayDestroyProdData`: mọi principal không phải BreakGlass (hoặc role ứng dụng có phạm vi hẹp) bị Deny xoá dữ liệu prod - kể cả khi ai đó lỡ gắn `AdministratorAccess` | Deny tường minh, admin tài khoản prod không gỡ được SCP |
| 4. Bất biến bản sao lưu | Object Lock COMPLIANCE 35 ngày + bucket policy + Backup Vault Lock + SCP `BackupsCannotBeDestroyedByAnyone` | Kể cả BreakGlass, kể cả root, không xoá được bản sao lưu trong thời hạn lưu giữ |
| 5. Phát hiện | Rule `break-glass-activity` và `prod-destructive-actions` gửi cảnh báo trong vòng vài phút | Cả đội biết ngay ai đang làm gì |

## Các bước
1. **Người xin** mở ticket: thao tác cụ thể, tài nguyên (ARN), lý do, kế hoạch khôi phục, thời gian cần (≤ 120 phút).
2. **Người duyệt** (nhóm `shopfast-security`, khác người xin) xác minh có bản sao lưu gần nhất (`aws backup list-recovery-points-by-backup-vault --backup-vault-name shopfast-prod-vault`).
3. Người duyệt đăng nhập SSO bằng permission set `SecurityAuditor` ở tài khoản management và chạy:
   ```bash
   bash processes/scripts/break-glass.sh an.nguyen@shopfast.vn INC-77 "xoa bang shopfast-prod-legacy-carts" 60
   ```
4. Người xin đăng nhập SSO, chọn permission set `BreakGlass` (phiên 1 giờ), thực hiện **đúng** thao tác trong ticket. Mọi lời gọi API bị gắn nhãn `AWSReservedSSO_BreakGlass_*` và cảnh báo tới kênh an ninh.
5. Hết giờ: Scheduler tự gỡ gán. Người duyệt dán link CloudTrail các sự kiện của phiên vào ticket và đóng ticket.

## Khôi phục khi xoá nhầm
- S3 / RDS / DynamoDB: khôi phục từ `shopfast-prod-vault` bằng permission set `Operator` (`backup:StartRestoreJob`).
- File sao lưu CSDL trong `shopfast-prod-backup`: không thể bị xoá trong 35 ngày, tải lại trực tiếp.

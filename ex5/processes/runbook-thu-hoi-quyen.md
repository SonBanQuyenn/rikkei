# Runbook - Thu hồi quyền

**Khi nào**: nghỉ việc (ngày cuối, trước 17h), chuyển vai trò, nghi ngờ tài khoản bị chiếm, hết hạn thực tập.
**Ai thực hiện**: `shopfast-operators` / `shopfast-security`. **Mục tiêu**: < 5 phút từ lúc nhận yêu cầu tới khi không còn phiên nào hoạt động.

## Các bước
1. Đăng nhập SSO (MFA) vào tài khoản management.
2. Chạy:
   ```bash
   # Nghỉ việc / sự cố: xoá danh tính
   bash processes/scripts/revoke-access.sh an.nguyen@shopfast.vn ACC-2048
   # Chuyển vai trò: giữ danh tính
   bash processes/scripts/revoke-access.sh an.nguyen@shopfast.vn ACC-2048 --keep-user
   ```
   Script làm theo thứ tự:
   | # | Hành động | Vì sao |
   |---|---|---|
   | 1 | Thêm `*:<email>` vào SCP `shopfast-revoked-sessions` | Phiên SSO đã cấp (≤ 8 giờ) **không** tự mất khi rút nhóm. SCP Deny theo `aws:userid` cắt mọi phiên ở mọi tài khoản trong vài giây |
   | 2 | Rút khỏi mọi nhóm | Không assume được permission set nào nữa |
   | 3 | Gỡ gán trực tiếp (BreakGlass còn hạn) | Không còn đường cấp quyền cá nhân |
   | 4 | Xoá user Identity Center (nếu nghỉ việc) | Không đăng nhập lại được |
   | 5 | Kiểm chứng + ghi `REVOKE` vào `access-log.tsv` | Bằng chứng |
3. Kiểm chứng thêm:
   ```bash
   aws cloudtrail lookup-events --lookup-attributes AttributeKey=Username,AttributeValue=an.nguyen@shopfast.vn \
     --start-time "$(date -u -d '-10 min' +%FT%TZ)" --query 'Events[].[EventTime,EventName,ErrorCode]'
   ```
   Mọi sự kiện sau thời điểm thu hồi phải có `ErrorCode=AccessDenied`.
4. Sau 8 giờ: gỡ email khỏi `policies/scp/scp-revoked-sessions.json` và cập nhật lại SCP (giữ SCP gọn, dưới giới hạn 5.120 ký tự).
5. Không có khoá dài hạn nào để thu hồi - SCP `NoLongTermCredentialsAnywhere` bảo đảm điều đó.

## Thu hồi quyền của máy (ứng dụng / pipeline)
- Pipeline: xoá hoặc sửa trust policy `shopfast-ci-backend-deployer` (chỉ role `shopfast-platform-iac` sửa được).
- Ứng dụng: phiên của task role đã cấp - gắn inline `AWSRevokeOlderSessions` (Deny khi `aws:TokenIssueTime` < bây giờ) qua `shopfast-platform-iac`, rồi triển khai lại task.

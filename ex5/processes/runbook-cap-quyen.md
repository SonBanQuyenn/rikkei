# Runbook - Cấp quyền

**Ai thực hiện**: thành viên nhóm `shopfast-operators` hoặc `shopfast-security`. **Ai duyệt**: quản lý trực tiếp của người nhận quyền (không được là người thực hiện).
**Thời gian**: ≤ 10 phút. **Bằng chứng**: dòng `GRANT` trong `processes/access-log.tsv` + sự kiện `CreateGroupMembership` trong CloudTrail.

## Đầu vào bắt buộc (trong ticket)
| Trường | Ví dụ |
|---|---|
| Email công ty | `an.nguyen@shopfast.vn` |
| Vai trò | một trong: `shopfast-interns`, `shopfast-developers`, `shopfast-operators`, `shopfast-security` |
| Người duyệt | `lead.backend@shopfast.vn` |
| Mã ticket | `ACC-1024` |

Chọn vai trò theo bảng: thực tập / tuần đầu → `shopfast-interns`; lập trình viên → `shopfast-developers`; vận hành prod → `shopfast-operators`; an ninh / kiểm toán → `shopfast-security`. **Không có** vai trò nào cho quyền xoá dữ liệu prod thường trực (xem `runbook-break-glass.md`).

## Các bước
1. Đăng nhập SSO (MFA) vào tài khoản management với permission set của mình.
2. Kiểm tra ticket đã có người duyệt và người duyệt ≠ bạn.
3. Chạy:
   ```bash
   bash processes/scripts/grant-access.sh an.nguyen@shopfast.vn shopfast-developers ACC-1024 lead.backend@shopfast.vn
   ```
   Script tự từ chối nếu: vai trò không hợp lệ / là BreakGlass, tự duyệt, hoặc người đó đã ở một nhóm vai trò khác.
4. Người nhận đăng nhập `https://shopfast.awsapps.com/start`, đặt mật khẩu, **đăng ký MFA** (Identity Center bắt buộc MFA mỗi lần đăng nhập).
5. Kiểm tra: người nhận chạy `aws sts get-caller-identity --profile <profile>` thấy `AWSReservedSSO_<PermissionSet>_.../<email>`.
6. Đóng ticket, dán dòng log ở bước 3.

## Đổi vai trò (vd intern → developer)
`revoke-access.sh <email> <ticket> --keep-user` rồi `grant-access.sh` với vai trò mới. Không bao giờ để một người ở hai nhóm.

## Không được làm
- Tạo IAM user / access key (SCP chặn ở mọi tài khoản).
- Gán permission set trực tiếp cho cá nhân thay vì qua nhóm (trừ BreakGlass có hẹn giờ).

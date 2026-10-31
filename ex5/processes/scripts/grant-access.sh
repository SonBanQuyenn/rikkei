#!/usr/bin/env bash
# Cấp quyền chuẩn hoá: thêm một người vào ĐÚNG MỘT nhóm vai trò.
#   bash processes/scripts/grant-access.sh <email> <nhom> <ticket> <nguoi-duyet-email>
# Nhóm hợp lệ: shopfast-interns | shopfast-developers | shopfast-operators | shopfast-security
set -euo pipefail
cd "$(dirname "$0")/../.."

EMAIL="$1"; GROUP="$2"; TICKET="$3"; APPROVER="$4"
REQUESTER=$(aws sts get-caller-identity --query Arn --output text | awk -F/ '{print $NF}')
VALID="shopfast-interns shopfast-developers shopfast-operators shopfast-security"

[[ " $VALID " == *" $GROUP "* ]] || { echo "LỖI: nhóm '$GROUP' không hợp lệ (BreakGlass chỉ cấp qua break-glass.sh)"; exit 1; }
[ "$APPROVER" != "$EMAIL" ] || { echo "LỖI: không được tự duyệt cho chính mình"; exit 1; }
[ "$APPROVER" != "$REQUESTER" ] || { echo "LỖI: người duyệt phải khác người thực hiện"; exit 1; }

STORE_ID=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)
gid() { aws identitystore get-group-id --identity-store-id "$STORE_ID" \
  --alternate-identifier "{\"UniqueAttribute\":{\"AttributePath\":\"displayName\",\"AttributeValue\":\"$1\"}}" \
  --query GroupId --output text; }

echo "1) Tạo người dùng (nếu chưa có) - danh tính cá nhân, đăng nhập SSO + MFA bắt buộc"
USER_ID=$(aws identitystore get-user-id --identity-store-id "$STORE_ID" \
  --alternate-identifier "{\"UniqueAttribute\":{\"AttributePath\":\"userName\",\"AttributeValue\":\"$EMAIL\"}}" \
  --query UserId --output text 2>/dev/null || true)
if [ -z "$USER_ID" ] || [ "$USER_ID" = "None" ]; then
  USER_ID=$(aws identitystore create-user --identity-store-id "$STORE_ID" --user-name "$EMAIL" \
    --display-name "$EMAIL" --name "GivenName=${EMAIL%@*},FamilyName=ShopFast" \
    --emails "Value=$EMAIL,Type=work,Primary=true" --query UserId --output text)
fi

echo "2) Bảo đảm chỉ thuộc MỘT nhóm vai trò"
for g in $VALID; do
  [ "$g" = "$GROUP" ] && continue
  m=$(aws identitystore get-group-membership-id --identity-store-id "$STORE_ID" --group-id "$(gid "$g")" \
      --member-id "UserId=$USER_ID" --query MembershipId --output text 2>/dev/null || true)
  [ -n "$m" ] && [ "$m" != "None" ] && { echo "LỖI: $EMAIL đang ở nhóm $g - thu hồi trước (revoke-access.sh)"; exit 1; }
done

echo "3) Thêm vào nhóm $GROUP (permission set đã gán sẵn cho nhóm)"
aws identitystore create-group-membership --identity-store-id "$STORE_ID" --group-id "$(gid "$GROUP")" \
  --member-id "UserId=$USER_ID" >/dev/null

echo "4) Ghi biên bản (CloudTrail cũng đã ghi CreateGroupMembership)"
printf '%s\tGRANT\t%s\t%s\tticket=%s\tby=%s\tapprover=%s\n' "$(date -u +%FT%TZ)" "$EMAIL" "$GROUP" "$TICKET" "$REQUESTER" "$APPROVER" \
  | tee -a processes/access-log.tsv
echo "Xong. Người dùng nhận email kích hoạt, đặt mật khẩu và đăng ký MFA ở lần đăng nhập đầu."

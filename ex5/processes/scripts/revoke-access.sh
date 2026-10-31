#!/usr/bin/env bash
# Thu hồi quyền chuẩn hoá (nghỉ việc / chuyển vai trò / sự cố).
#   bash processes/scripts/revoke-access.sh <email> <ticket> [--keep-user]
# --keep-user: chỉ rút khỏi nhóm (chuyển vai trò); mặc định: xoá hẳn danh tính (nghỉ việc).
set -euo pipefail
cd "$(dirname "$0")/../.."

EMAIL="$1"; TICKET="$2"; MODE="${3:-}"
STORE_ID=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)
INSTANCE_ARN=$(aws sso-admin list-instances --query 'Instances[0].InstanceArn' --output text)
USER_ID=$(aws identitystore get-user-id --identity-store-id "$STORE_ID" \
  --alternate-identifier "{\"UniqueAttribute\":{\"AttributePath\":\"userName\",\"AttributeValue\":\"$EMAIL\"}}" \
  --query UserId --output text)

echo "1) Cắt NGAY mọi phiên đang hoạt động: thêm vào SCP shopfast-revoked-sessions"
#    Phiên SSO đã cấp vẫn còn hạn tới 8h; SCP Deny theo aws:userid = <role-id>:<email> có hiệu lực trong vài giây.
F=policies/scp/scp-revoked-sessions.json
jq --arg u "*:$EMAIL" '.Statement[0].Condition.StringLike["aws:userid"] |= (. + [$u] | unique)' "$F" > "$F.tmp" && mv "$F.tmp" "$F"
SCP_ID=$(aws organizations list-policies --filter SERVICE_CONTROL_POLICY \
  --query "Policies[?Name=='shopfast-revoked-sessions'].Id" --output text)
aws organizations update-policy --policy-id "$SCP_ID" --content "file://$F" >/dev/null

echo "2) Rút khỏi mọi nhóm"
for mid in $(aws identitystore list-group-memberships-for-member --identity-store-id "$STORE_ID" \
             --member-id "UserId=$USER_ID" --query 'GroupMemberships[].MembershipId' --output text); do
  aws identitystore delete-group-membership --identity-store-id "$STORE_ID" --membership-id "$mid"
done

echo "3) Gỡ mọi gán trực tiếp cho người dùng (vd BreakGlass còn hạn)"
for ps in $(aws sso-admin list-permission-sets --instance-arn "$INSTANCE_ARN" --query 'PermissionSets[]' --output text); do
  for acct in $(aws sso-admin list-accounts-for-provisioned-permission-set --instance-arn "$INSTANCE_ARN" \
                --permission-set-arn "$ps" --query 'AccountIds[]' --output text); do
    aws sso-admin list-account-assignments --instance-arn "$INSTANCE_ARN" --account-id "$acct" --permission-set-arn "$ps" \
      --query "AccountAssignments[?PrincipalId=='$USER_ID'].PrincipalId" --output text | grep -q . && \
    aws sso-admin delete-account-assignment --instance-arn "$INSTANCE_ARN" --target-id "$acct" --target-type AWS_ACCOUNT \
      --permission-set-arn "$ps" --principal-type USER --principal-id "$USER_ID" >/dev/null
  done
done

if [ "$MODE" != "--keep-user" ]; then
  echo "4) Xoá danh tính - không thể đăng nhập lại (CloudTrail vẫn giữ tên email trong lịch sử)"
  aws identitystore delete-user --identity-store-id "$STORE_ID" --user-id "$USER_ID"
fi

echo "5) Kiểm chứng"
echo -n "   nhóm còn lại: "; aws identitystore list-group-memberships-for-member --identity-store-id "$STORE_ID" \
  --member-id "UserId=$USER_ID" --query 'length(GroupMemberships)' --output text 2>/dev/null || echo "0 (user đã xoá)"
echo "   SCP đang chặn: $(jq -c '.Statement[0].Condition.StringLike["aws:userid"]' "$F")"

printf '%s\tREVOKE\t%s\t-\tticket=%s\n' "$(date -u +%FT%TZ)" "$EMAIL" "$TICKET" | tee -a processes/access-log.tsv
echo "Sau 8 giờ (thời hạn phiên dài nhất) có thể gỡ $EMAIL khỏi SCP shopfast-revoked-sessions."

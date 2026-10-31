#!/usr/bin/env bash
# Cấp quyền khẩn cấp BreakGlass trên prod - HAI NGƯỜI, CÓ THỜI HẠN, CẢNH BÁO TỨC THÌ.
# Chạy bởi NGƯỜI DUYỆT (thuộc nhóm shopfast-security), không phải người xin quyền:
#   bash processes/scripts/break-glass.sh <email-nguoi-xin> <ticket> "<ly do>" [phut=60]
set -euo pipefail
cd "$(dirname "$0")/../.."

REQ="$1"; TICKET="$2"; REASON="$3"; MINUTES="${4:-60}"
PROD=$(jq -r '.accounts.prod' roles/permission-sets.json)
MAX=$(jq -r '.permissionSets.BreakGlass.assignments[0].maxMinutes' roles/permission-sets.json)
APPROVER=$(aws sts get-caller-identity --query Arn --output text | awk -F/ '{print $NF}')

[ "$MINUTES" -le "$MAX" ] || { echo "LỖI: tối đa $MAX phút"; exit 1; }
[ "$APPROVER" != "$REQ" ] || { echo "LỖI: người xin quyền không được tự duyệt"; exit 1; }
aws sts get-caller-identity --query Arn --output text | grep -q "AWSReservedSSO_SecurityAuditor_" \
  || { echo "LỖI: chỉ nhóm shopfast-security được duyệt BreakGlass"; exit 1; }

INSTANCE_ARN=$(aws sso-admin list-instances --query 'Instances[0].InstanceArn' --output text)
STORE_ID=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)
PS_ARN=$(aws sso-admin list-permission-sets --instance-arn "$INSTANCE_ARN" --output text --query 'PermissionSets[]' |
  tr '\t' '\n' | while read -r p; do
    n=$(aws sso-admin describe-permission-set --instance-arn "$INSTANCE_ARN" --permission-set-arn "$p" --query 'PermissionSet.Name' --output text)
    [ "$n" = "BreakGlass" ] && echo "$p"; done)
USER_ID=$(aws identitystore get-user-id --identity-store-id "$STORE_ID" \
  --alternate-identifier "{\"UniqueAttribute\":{\"AttributePath\":\"userName\",\"AttributeValue\":\"$REQ\"}}" \
  --query UserId --output text)

echo "1) Gán BreakGlass cho $REQ trên prod ($PROD) - EventBridge sẽ báo cả đội ngay lúc này"
aws sso-admin create-account-assignment --instance-arn "$INSTANCE_ARN" --permission-set-arn "$PS_ARN" \
  --target-type AWS_ACCOUNT --target-id "$PROD" --principal-type USER --principal-id "$USER_ID" >/dev/null

echo "2) Hẹn giờ TỰ ĐỘNG gỡ sau $MINUTES phút (EventBridge Scheduler gọi thẳng API sso-admin)"
AT=$(date -u -d "+$MINUTES minutes" +%Y-%m-%dT%H:%M:%S)
aws scheduler create-schedule --name "revoke-breakglass-${USER_ID:0:8}-$(date +%s)" \
  --schedule-expression "at($AT)" --flexible-time-window Mode=OFF --action-after-completion DELETE \
  --target "{\"Arn\":\"arn:aws:scheduler:::aws-sdk:ssoadmin:deleteAccountAssignment\",
             \"RoleArn\":\"arn:aws:iam::999999999999:role/shopfast-platform-security-automation\",
             \"Input\":\"{\\\"InstanceArn\\\":\\\"$INSTANCE_ARN\\\",\\\"TargetId\\\":\\\"$PROD\\\",\\\"TargetType\\\":\\\"AWS_ACCOUNT\\\",\\\"PermissionSetArn\\\":\\\"$PS_ARN\\\",\\\"PrincipalType\\\":\\\"USER\\\",\\\"PrincipalId\\\":\\\"$USER_ID\\\"}\"}"

printf '%s\tBREAKGLASS\t%s\t%smin\tticket=%s\tapprover=%s\treason=%s\n' \
  "$(date -u +%FT%TZ)" "$REQ" "$MINUTES" "$TICKET" "$APPROVER" "$REASON" | tee -a processes/access-log.tsv
echo "Lưu ý: kể cả BreakGlass cũng KHÔNG xoá được bucket shopfast-prod-backup / backup vault (SCP + Object Lock + Vault Lock)."

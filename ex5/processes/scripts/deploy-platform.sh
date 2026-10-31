#!/usr/bin/env bash
# Dựng toàn bộ nền tảng quản trị truy cập (chạy từ tài khoản management bằng role shopfast-platform-iac).
#   bash processes/scripts/deploy-platform.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

ROOT_ID=$(aws organizations list-roots --query 'Roots[0].Id' --output text)
PROD_OU=$(aws organizations list-organizational-units-for-parent --parent-id "$ROOT_ID" \
  --query "OrganizationalUnits[?Name=='Prod'].Id" --output text)
PROD=$(jq -r '.accounts.prod' roles/permission-sets.json)

echo "== 1. Lớp tổ chức: SCP"
create_scp() { # name file target
  local id
  id=$(aws organizations create-policy --type SERVICE_CONTROL_POLICY --name "$1" \
        --description "ShopFast $1" --content "file://$2" --query 'Policy.PolicySummary.Id' --output text)
  aws organizations attach-policy --policy-id "$id" --target-id "$3"
  echo "   + $1 -> $3 ($id)"
}
create_scp shopfast-baseline        policies/scp/scp-baseline.json              "$ROOT_ID"
create_scp shopfast-revoked-sessions policies/scp/scp-revoked-sessions.json     "$ROOT_ID"
create_scp shopfast-prod-data        policies/scp/scp-prod-data-protection.json "$PROD_OU"

echo "== 2. Lớp tài nguyên: bucket sao lưu bất biến (Object Lock COMPLIANCE 35 ngày) + bucket policy"
aws s3api create-bucket --bucket shopfast-prod-backup --region ap-southeast-1 \
  --create-bucket-configuration LocationConstraint=ap-southeast-1 --object-lock-enabled-for-bucket
aws s3api put-object-lock-configuration --bucket shopfast-prod-backup \
  --object-lock-configuration file://policies/resource/prod-backup-object-lock.json
aws s3api put-bucket-policy --bucket shopfast-prod-backup --policy file://policies/resource/prod-backup-bucket-policy.json
aws backup create-backup-vault --backup-vault-name shopfast-prod-vault
aws backup put-backup-vault-lock-configuration --backup-vault-name shopfast-prod-vault \
  --min-retention-days 35 --changeable-for-days 3

echo "== 3. Vai trò cho người: permission sets IAM Identity Center"
INSTANCE_ARN=$(aws sso-admin list-instances --query 'Instances[0].InstanceArn' --output text)
STORE_ID=$(aws sso-admin list-instances --query 'Instances[0].IdentityStoreId' --output text)
for ps in $(jq -r '.permissionSets | keys[]' roles/permission-sets.json); do
  dur=$(jq -r --arg p "$ps" '.permissionSets[$p].sessionDuration' roles/permission-sets.json)
  arn=$(aws sso-admin create-permission-set --instance-arn "$INSTANCE_ARN" --name "$ps" \
        --session-duration "$dur" --query 'PermissionSet.PermissionSetArn' --output text)
  for m in $(jq -r --arg p "$ps" '.permissionSets[$p].awsManaged[]' roles/permission-sets.json); do
    aws sso-admin attach-managed-policy-to-permission-set --instance-arn "$INSTANCE_ARN" \
      --permission-set-arn "$arn" --managed-policy-arn "arn:aws:iam::aws:policy/$m"
  done
  inline=$(jq -r --arg p "$ps" '.permissionSets[$p].inline // empty' roles/permission-sets.json)
  [ -n "$inline" ] && aws sso-admin put-inline-policy-to-permission-set --instance-arn "$INSTANCE_ARN" \
      --permission-set-arn "$arn" --inline-policy "file://$inline"
  # Gán thường trực theo nhóm (BreakGlass là 'timed' -> bỏ qua, chỉ gán qua runbook)
  jq -c --arg p "$ps" '.permissionSets[$p].assignments[] | select(.type=="permanent")' roles/permission-sets.json |
  while read -r a; do
    acct=$(jq -r --argjson a "$a" '.accounts[$a.account]' roles/permission-sets.json)
    group=$(echo "$a" | jq -r .group)
    gid=$(aws identitystore get-group-id --identity-store-id "$STORE_ID" \
          --alternate-identifier "{\"UniqueAttribute\":{\"AttributePath\":\"displayName\",\"AttributeValue\":\"$group\"}}" \
          --query GroupId --output text)
    aws sso-admin create-account-assignment --instance-arn "$INSTANCE_ARN" --permission-set-arn "$arn" \
      --target-type AWS_ACCOUNT --target-id "$acct" --principal-type GROUP --principal-id "$gid" >/dev/null
  done
  echo "   + $ps"
done

echo "== 4. Vai trò cho máy (không khoá dài hạn): pipeline OIDC + task role ứng dụng"
aws iam create-role --role-name shopfast-ci-backend-deployer --max-session-duration 3600 \
  --assume-role-policy-document file://roles/ci-deployer.trust.json
aws iam put-role-policy --role-name shopfast-ci-backend-deployer --policy-name deploy \
  --policy-document file://roles/ci-deployer.permissions.json
aws iam create-role --role-name shopfast-prod-app-api \
  --assume-role-policy-document file://roles/app-runtime.trust.json
aws iam put-role-policy --role-name shopfast-prod-app-api --policy-name runtime \
  --policy-document file://roles/app-runtime.permissions.json

echo "== 5. Ghi nhật ký + phát hiện bất thường"
bash detection/setup-detection.sh
echo "Hoàn tất. Tài khoản prod: $PROD"

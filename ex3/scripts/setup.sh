#!/usr/bin/env bash
# Dựng toàn bộ cấu trúc quản trị truy cập cho ShopFast (chạy MỘT lần bằng tài khoản quản trị).
# Yêu cầu: aws CLI v2, jq. Chạy từ thư mục ex3:  bash scripts/setup.sh
set -euo pipefail

ACCOUNT=123456789012
REGION=ap-southeast-1
cd "$(dirname "$0")/.."

echo "== 1. Nhật ký truy vết: bucket + CloudTrail đa vùng, có xác thực toàn vẹn file log"
aws s3api create-bucket --bucket shopfast-audit-logs --region "$REGION" \
  --create-bucket-configuration LocationConstraint="$REGION" --object-lock-enabled-for-bucket
aws s3api put-object-lock-configuration --bucket shopfast-audit-logs --object-lock-configuration \
  '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"COMPLIANCE","Days":365}}}'
aws s3api put-public-access-block --bucket shopfast-audit-logs --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-policy --bucket shopfast-audit-logs --policy file://audit/audit-bucket-policy.json
aws cloudtrail create-trail --name shopfast-audit --s3-bucket-name shopfast-audit-logs \
  --is-multi-region-trail --include-global-service-events --enable-log-file-validation --region "$REGION"
aws cloudtrail put-event-selectors --trail-name shopfast-audit \
  --advanced-event-selectors file://audit/event-selectors.json --region "$REGION"
aws cloudtrail start-logging --name shopfast-audit --region "$REGION"

echo "== 2. Chính sách mật khẩu tài khoản"
aws iam update-account-password-policy --minimum-password-length 14 \
  --require-symbols --require-numbers --require-uppercase-characters --require-lowercase-characters \
  --max-password-age 90 --password-reuse-prevention 12

echo "== 3. Chính sách tự viết"
for f in policies/ShopFast-*.json; do
  name=$(basename "$f" .json)
  aws iam create-policy --policy-name "$name" --policy-document "file://$f" >/dev/null
  echo "   + $name"
done

echo "== 4. Nhóm và gắn chính sách (custom + AWS quản lý)"
for g in $(jq -r '.groups | keys[]' iam-structure.json); do
  aws iam create-group --group-name "$g" >/dev/null
  for p in $(jq -r --arg g "$g" '.groups[$g].custom[]' iam-structure.json); do
    aws iam attach-group-policy --group-name "$g" --policy-arn "arn:aws:iam::$ACCOUNT:policy/$p"
  done
  for p in $(jq -r --arg g "$g" '.groups[$g].aws_managed[]' iam-structure.json); do
    aws iam attach-group-policy --group-name "$g" --policy-arn "arn:aws:iam::aws:policy/$p"
  done
  echo "   + $g"
done

echo "== 5. Role quản trị IAM (dùng Role thay cho cấp quyền IAM thẳng vào user)"
aws iam create-policy --policy-name ShopFast-IamAdmin-Permissions \
  --policy-document file://roles/ShopFast-IamAdmin.permissions.json >/dev/null
aws iam create-role --role-name ShopFast-IamAdmin --max-session-duration 3600 \
  --assume-role-policy-document file://roles/ShopFast-IamAdmin.trust.json \
  --permissions-boundary "arn:aws:iam::$ACCOUNT:policy/ShopFast-IamAdmin-Permissions" >/dev/null
aws iam attach-role-policy --role-name ShopFast-IamAdmin \
  --policy-arn "arn:aws:iam::$ACCOUNT:policy/ShopFast-IamAdmin-Permissions"

echo "== 6. Tạo 15 tài khoản cá nhân theo iam-structure.json"
jq -r '.users[].name' iam-structure.json | while read -r u; do
  bash scripts/onboard.sh "$u"
done

echo "== 7. Khoá tài khoản admin dùng chung cũ (sau khi mọi người đã có tài khoản riêng)"
echo "   -> chạy: bash scripts/offboard.sh shopfast-shared-admin"
echo "Xong. Kế toán cần bật 'IAM user and role access to Billing information' trong Account settings (root)."

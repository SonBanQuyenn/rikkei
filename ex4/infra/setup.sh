#!/usr/bin/env bash
# Triển khai giải pháp (d): Role gắn vào máy chủ + Secrets Manager (xoay vòng tự động)
# + IAM Roles Anywhere cho tác vụ chạy ngoài cloud + permission set cho máy lập trình viên.
# Chạy từ thư mục ex4:  bash infra/setup.sh
set -euo pipefail
cd "$(dirname "$0")/.."

ACCOUNT=123456789012
REGION=ap-southeast-1
KMS_KEY_ARN="arn:aws:kms:$REGION:$ACCOUNT:key/1111aaaa-22bb-33cc-44dd-555555eeeeee"

echo "== 1. Bí mật CSDL trong Secrets Manager (mã hoá bằng KMS key riêng)"
# Bí mật 'master' chỉ dùng cho Lambda xoay vòng; ứng dụng dùng bí mật 'db-app'.
aws secretsmanager create-secret --name shopfast/prod/db-master --kms-key-id "$KMS_KEY_ARN" \
  --secret-string file://config/db-master.secret.json --region "$REGION"
aws secretsmanager create-secret --name shopfast/prod/db-app --kms-key-id "$KMS_KEY_ARN" \
  --secret-string file://config/db-app.secret.json --region "$REGION"

echo "== 2. Xoay vòng tự động 30 ngày, chiến lược 'alternating users' (không gián đoạn)"
# Lambda xoay vòng tạo từ ứng dụng mẫu AWS SecretsManagerRDSPostgreSQLRotationMultiUser
aws secretsmanager rotate-secret --secret-id shopfast/prod/db-app --region "$REGION" \
  --rotation-lambda-arn "arn:aws:lambda:$REGION:$ACCOUNT:function:shopfast-prod-db-rotation-multiuser" \
  --rotation-rules '{"ScheduleExpression":"rate(30 days)","Duration":"2h"}'

echo "== 3. Role cho máy chủ EC2 (b) + instance profile"
aws iam create-role --role-name shopfast-prod-app-invoice \
  --assume-role-policy-document file://iam/ec2-trust-policy.json --max-session-duration 3600
aws iam put-role-policy --role-name shopfast-prod-app-invoice --policy-name invoice-app \
  --policy-document file://iam/prod-app-permission-policy.json
aws iam create-instance-profile --instance-profile-name shopfast-prod-app-invoice
aws iam add-role-to-instance-profile --instance-profile-name shopfast-prod-app-invoice \
  --role-name shopfast-prod-app-invoice

echo "== 4. Launch template: bắt buộc IMDSv2, hop limit 1 (chặn SSRF / container lấy trộm credential)"
aws ec2 create-launch-template --launch-template-name shopfast-prod-invoice --region "$REGION" \
  --launch-template-data file://infra/launch-template.json

echo "== 5. IAM Roles Anywhere cho tác vụ định kỳ ngoài cloud"
TA_ARN=$(aws rolesanywhere create-trust-anchor --name shopfast-onprem-ca --enabled --region "$REGION" \
  --source "sourceType=CERTIFICATE_BUNDLE,sourceData={x509CertificateData=$(cat infra/pki/shopfast-onprem-ca.crt)}" \
  --query 'trustAnchor.trustAnchorArn' --output text)
echo "   trust anchor: $TA_ARN  (cập nhật aws:SourceArn trong iam/rolesanywhere-trust-policy.json)"
aws iam create-role --role-name shopfast-prod-cron-invoice \
  --assume-role-policy-document file://iam/rolesanywhere-trust-policy.json --max-session-duration 3600
aws iam put-role-policy --role-name shopfast-prod-cron-invoice --policy-name invoice-cron \
  --policy-document file://iam/onprem-cron-permission-policy.json
aws rolesanywhere create-profile --name shopfast-invoice-cron --enabled --region "$REGION" \
  --role-arns "arn:aws:iam::$ACCOUNT:role/shopfast-prod-cron-invoice" --duration-seconds 3600

echo "== 6. Máy lập trình viên: permission set IAM Identity Center chỉ chạm tài nguyên dev"
INSTANCE_ARN=$(aws sso-admin list-instances --query 'Instances[0].InstanceArn' --output text)
PS_ARN=$(aws sso-admin create-permission-set --instance-arn "$INSTANCE_ARN" --name ShopFastInvoiceDev \
  --session-duration PT8H --query 'PermissionSet.PermissionSetArn' --output text)
aws sso-admin put-inline-policy-to-permission-set --instance-arn "$INSTANCE_ARN" \
  --permission-set-arn "$PS_ARN" --inline-policy file://iam/dev-permission-set-policy.json

echo "== 7. Phát hiện credential bị lấy trộm"
aws guardduty create-detector --enable --region "$REGION" >/dev/null || true
echo "Hoàn tất."

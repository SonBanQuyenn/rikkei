#!/usr/bin/env bash
# Chứng minh người đã nghỉ việc KHÔNG còn đường truy cập nào.
#   bash scripts/verify-offboard.sh <ten-user>
set -uo pipefail

ACCOUNT=123456789012
U="$1"
ARN="arn:aws:iam::$ACCOUNT:user/$U"
FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  [OK]   $1"; else echo "  [LỖI]  $1 (thực tế: $2)"; FAIL=1; fi; }

echo "Đường 1 - đăng nhập console"
aws iam get-login-profile --user-name "$U" >/dev/null 2>&1; check "không còn mật khẩu console" "$?" "254"

echo "Đường 2 - access key"
check "0 access key" "$(aws iam list-access-keys --user-name "$U" --query 'length(AccessKeyMetadata)')" "0"

echo "Đường 3 - MFA / SSH / credential dịch vụ / chứng chỉ"
check "0 thiết bị MFA" "$(aws iam list-mfa-devices --user-name "$U" --query 'length(MFADevices)')" "0"
check "0 SSH key" "$(aws iam list-ssh-public-keys --user-name "$U" --query 'length(SSHPublicKeys)')" "0"
check "0 credential dịch vụ" "$(aws iam list-service-specific-credentials --user-name "$U" --query 'length(ServiceSpecificCredentials)')" "0"
check "0 chứng chỉ ký" "$(aws iam list-signing-certificates --user-name "$U" --query 'length(Certificates)')" "0"

echo "Đường 4 - quyền qua nhóm / chính sách"
check "không thuộc nhóm nào" "$(aws iam list-groups-for-user --user-name "$U" --query 'length(Groups)')" "0"
check "chỉ còn ShopFast-DenyAll" "$(aws iam list-attached-user-policies --user-name "$U" --query 'AttachedPolicies[].PolicyName' --output text)" "ShopFast-DenyAll"
check "0 inline policy" "$(aws iam list-user-policies --user-name "$U" --query 'length(PolicyNames)')" "0"

echo "Đường 5 - Role có trust policy nhắc tới user này"
N=$(aws iam get-account-authorization-details --filter Role --output json | grep -c "$ARN" || true)
check "không Role nào tin cậy trực tiếp $ARN" "$N" "0"

echo "Đường 6 - resource policy (bucket/KMS/SQS...) trao quyền cho user: dùng IAM Access Analyzer"
aws accessanalyzer list-findings --analyzer-arn "arn:aws:access-analyzer:ap-southeast-1:$ACCOUNT:analyzer/shopfast" \
  --filter "{\"principal.AWS\":{\"contains\":[\"$ARN\"]},\"status\":{\"eq\":[\"ACTIVE\"]}}" \
  --query 'length(findings)' --output text 2>/dev/null | xargs -I{} echo "  findings còn hoạt động: {}"

echo "Đường 7 - mô phỏng quyền hiệu lực (phải là explicitDeny cho mọi hành động)"
aws iam simulate-principal-policy --policy-source-arn "$ARN" \
  --action-names s3:GetObject ec2:DescribeInstances logs:GetLogEvents iam:CreateAccessKey sts:AssumeRole \
  --query 'EvaluationResults[].[EvalActionName,EvalDecision]' --output table

echo "Đường 8 - hoạt động sau thời điểm thu hồi (CloudTrail)"
aws cloudtrail lookup-events --lookup-attributes AttributeKey=Username,AttributeValue="$U" --max-results 5 \
  --query 'Events[].[EventTime,EventName]' --output table

[ $FAIL -eq 0 ] && echo "KẾT LUẬN: $U không còn đường truy cập nào." || { echo "KẾT LUẬN: CÒN đường truy cập - xử lý ngay"; exit 1; }

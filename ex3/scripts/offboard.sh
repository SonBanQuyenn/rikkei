#!/usr/bin/env bash
# Thu hồi TOÀN BỘ quyền của một nhân viên nghỉ việc - mục tiêu dưới 5 phút.
# Chạy bằng phiên Role ShopFast-IamAdmin (MFA):  bash scripts/offboard.sh <ten-user>
set -euo pipefail
cd "$(dirname "$0")/.."

ACCOUNT=123456789012
U="$1"
START=$(date +%s)
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "[1] Chặn ngay mọi request (kể cả phiên console đang mở và token tạm từ GetSessionToken)"
aws iam attach-user-policy --user-name "$U" --policy-arn "arn:aws:iam::$ACCOUNT:policy/ShopFast-DenyAll"

echo "[2] Xoá đăng nhập console"
aws iam delete-login-profile --user-name "$U" 2>/dev/null || echo "    (không có mật khẩu)"

echo "[3] Vô hiệu hoá rồi xoá mọi access key"
for k in $(aws iam list-access-keys --user-name "$U" --query 'AccessKeyMetadata[].AccessKeyId' --output text); do
  aws iam update-access-key --user-name "$U" --access-key-id "$k" --status Inactive
  aws iam delete-access-key --user-name "$U" --access-key-id "$k"
  echo "    - key $k"
done

echo "[4] Gỡ MFA, SSH key, credential dịch vụ (CodeCommit...), chứng chỉ ký"
for m in $(aws iam list-mfa-devices --user-name "$U" --query 'MFADevices[].SerialNumber' --output text); do
  aws iam deactivate-mfa-device --user-name "$U" --serial-number "$m"
  aws iam delete-virtual-mfa-device --serial-number "$m" 2>/dev/null || true
done
for s in $(aws iam list-ssh-public-keys --user-name "$U" --query 'SSHPublicKeys[].SSHPublicKeyId' --output text); do
  aws iam delete-ssh-public-key --user-name "$U" --ssh-public-key-id "$s"
done
for c in $(aws iam list-service-specific-credentials --user-name "$U" --query 'ServiceSpecificCredentials[].ServiceSpecificCredentialId' --output text); do
  aws iam delete-service-specific-credential --user-name "$U" --service-specific-credential-id "$c"
done
for c in $(aws iam list-signing-certificates --user-name "$U" --query 'Certificates[].CertificateId' --output text); do
  aws iam delete-signing-certificate --user-name "$U" --certificate-id "$c"
done

echo "[5] Rút khỏi mọi nhóm"
WAS_OPS=false
for g in $(aws iam list-groups-for-user --user-name "$U" --query 'Groups[].GroupName' --output text); do
  [ "$g" = "Ops-Engineers" ] && WAS_OPS=true
  aws iam remove-user-from-group --user-name "$U" --group-name "$g"
  echo "    - $g"
done

echo "[6] Thu hồi phiên Role đã assume trước đó (thông tin xác thực tạm của Role KHÔNG bị ảnh hưởng bởi bước 1)"
if [ "$WAS_OPS" = true ]; then
  aws iam put-role-policy --role-name ShopFast-IamAdmin --policy-name AWSRevokeOlderSessions \
    --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Deny\",\"Action\":\"*\",\"Resource\":\"*\",\"Condition\":{\"DateLessThan\":{\"aws:TokenIssueTime\":\"$NOW_ISO\"}}}]}"
  echo "    - mọi phiên ShopFast-IamAdmin cấp trước $NOW_ISO bị vô hiệu (người còn lại chỉ cần assume lại)"
fi

echo "[7] Đánh dấu trạng thái - GIỮ user (không xoá) để lịch sử CloudTrail luôn gắn với một danh tính"
aws iam tag-user --user-name "$U" --tags Key=Status,Value=offboarded Key=OffboardedAt,Value="$NOW_ISO"

END=$(date +%s)
echo "Thu hồi xong trong $((END-START)) giây. Chạy kiểm chứng: bash scripts/verify-offboard.sh $U"

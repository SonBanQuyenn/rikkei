#!/usr/bin/env bash
# Kịch bản demo trên môi trường AWS THẬT (sau khi chạy processes/scripts/deploy-platform.sh).
# Cần 3 profile SSO trong ~/.aws/config: shopfast-intern-dev, shopfast-operator-prod, shopfast-breakglass-prod.
#   bash demo/demo-aws.sh
set -uo pipefail

step() { echo; echo "=== $1"; }
expect() { # mô tả, kỳ vọng (ok|denied), lệnh...
  local desc="$1" want="$2"; shift 2
  out=$("$@" 2>&1); rc=$?
  if [ $rc -eq 0 ]; then got=ok; elif echo "$out" | grep -qE "AccessDenied|not authorized|explicit deny"; then got=denied; else got="lỗi khác"; fi
  echo "[$([ "$got" = "$want" ] && echo OK || echo SAI)] $desc -> $got"
  echo "$out" | grep -oE "(explicit deny in a [a-z ]+policy|no identity-based policy allows[^.]*)" | head -1 | sed 's/^/        /'
}

step "1. Thao tác được phép"
echo "demo" > /tmp/demo.txt
expect "Intern ghi file vào sandbox dev" ok \
  aws s3 cp /tmp/demo.txt s3://shopfast-dev-sandbox-binh/demo.txt --profile shopfast-intern-dev
expect "Operator khởi động lại CSDL prod" ok \
  aws rds reboot-db-instance --db-instance-identifier shopfast-prod-main --profile shopfast-operator-prod

step "2. Bị chặn bởi đặc quyền tối thiểu"
expect "Intern xoá bucket dùng chung dev" denied \
  aws s3api delete-bucket --bucket shopfast-dev-assets --profile shopfast-intern-dev
expect "Operator huỷ máy chủ prod" denied \
  aws ec2 terminate-instances --instance-ids i-0prod0000000001 --profile shopfast-operator-prod

step "3. Bị chặn bởi lớp kiểm soát bổ sung (SCP / bucket policy / Object Lock)"
expect "BreakGlass xoá file sao lưu" denied \
  aws s3api delete-object --bucket shopfast-prod-backup --key db/2026-10-30.sql.gz --profile shopfast-breakglass-prod
expect "BreakGlass xoá bucket sao lưu" denied \
  aws s3api delete-bucket --bucket shopfast-prod-backup --profile shopfast-breakglass-prod

step "4. Phát hiện: các thao tác bị chặn ở trên phải xuất hiện trong kênh cảnh báo trong vòng 15 phút"
aws cloudtrail lookup-events --lookup-attributes AttributeKey=EventName,AttributeValue=DeleteBucket \
  --start-time "$(date -u -d '-15 min' +%FT%TZ)" --query 'Events[].[EventTime,Username,EventName]' --output table \
  --profile shopfast-operator-prod

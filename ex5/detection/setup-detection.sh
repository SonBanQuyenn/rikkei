#!/usr/bin/env bash
# Ghi nhật ký + phát hiện bất thường dưới 15 phút.
# Chạy bằng role shopfast-platform-security-automation:
#   bash detection/setup-detection.sh
set -euo pipefail
cd "$(dirname "$0")/.."

MGMT=999999999999
LOG_ARCHIVE=333333333333
PROD=222222222222
REGION=ap-southeast-1
TOPIC_ARN="arn:aws:sns:$REGION:$PROD:shopfast-security-alerts"

echo "== 1. CloudTrail cấp tổ chức (mọi tài khoản, mọi vùng) -> bucket bất biến ở tài khoản log-archive"
aws s3api put-bucket-policy --bucket "shopfast-org-cloudtrail-$LOG_ARCHIVE" \
  --policy file://policies/resource/log-archive-bucket-policy.json
aws cloudtrail create-trail --name shopfast-org-trail --is-organization-trail --is-multi-region-trail \
  --include-global-service-events --enable-log-file-validation \
  --s3-bucket-name "shopfast-org-cloudtrail-$LOG_ARCHIVE" \
  --cloud-watch-logs-log-group-arn "arn:aws:logs:$REGION:$MGMT:log-group:/shopfast/org-cloudtrail:*" \
  --cloud-watch-logs-role-arn "arn:aws:iam::$MGMT:role/shopfast-platform-cloudtrail-to-logs"
# Data event S3 cho bucket prod (để bắt DeleteObject)
aws cloudtrail put-event-selectors --trail-name shopfast-org-trail --advanced-event-selectors \
  '[{"Name":"mgmt","FieldSelectors":[{"Field":"eventCategory","Equals":["Management"]}]},
    {"Name":"s3-prod-writes","FieldSelectors":[{"Field":"eventCategory","Equals":["Data"]},
     {"Field":"resources.type","Equals":["AWS::S3::Object"]},{"Field":"readOnly","Equals":["false"]},
     {"Field":"resources.ARN","StartsWith":["arn:aws:s3:::shopfast-prod-"]}]}]'
aws cloudtrail start-logging --name shopfast-org-trail

echo "== 2. GuardDuty"
aws guardduty create-detector --enable --finding-publishing-frequency FIFTEEN_MINUTES --region "$REGION" || true

echo "== 3. SNS nhận cảnh báo (mỗi vùng một topic - EventBridge chỉ gửi tới SNS cùng vùng)"
for region in "$REGION" us-east-1; do
  arn=$(aws sns create-topic --name shopfast-security-alerts --region "$region" --query TopicArn --output text)
  aws sns subscribe --topic-arn "$arn" --protocol email --notification-endpoint security@shopfast.vn --region "$region"
done

echo "== 4. Quy tắc EventBridge - CloudTrail -> EventBridge gần thời gian thực (giây đến vài phút)"
# Sự kiện IAM / đăng nhập là sự kiện toàn cục -> tạo thêm ở us-east-1.
for region in "$REGION" us-east-1; do
  for f in detection/eventbridge/*.json; do
    rule=shopfast-$(basename "$f" .json)
    aws events put-rule --name "$rule" --event-pattern "file://$f" --region "$region" >/dev/null
    aws events put-targets --rule "$rule" --region "$region" \
      --targets "Id=sns,Arn=arn:aws:sns:$region:$PROD:shopfast-security-alerts"
    echo "   + $rule ($region)"
  done
done

echo "== 5. Cảnh báo dồn dập AccessDenied (>=10 lần / 5 phút)"
F=detection/access-denied-metric-filter.json
aws logs put-metric-filter --log-group-name "$(jq -r .logGroupName $F)" --filter-name "$(jq -r .filterName $F)" \
  --filter-pattern "$(jq -r .filterPattern $F)" --metric-transformations "$(jq -c .metricTransformations $F)"
aws cloudwatch put-metric-alarm --cli-input-json "$(jq -c --arg t "$TOPIC_ARN" '.alarm + {AlarmActions:[$t]}' $F)"

echo "Xong. Thời gian phát hiện tối đa: EventBridge ~ vài phút; alarm AccessDenied <= 5 phút + độ trễ CloudTrail (~5 phút) < 15 phút."

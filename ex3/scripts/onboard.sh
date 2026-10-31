#!/usr/bin/env bash
# Cấp quyền cho MỘT nhân viên mới. Chạy bằng phiên Role ShopFast-IamAdmin.
#   bash scripts/onboard.sh <ten-user>
# Thông tin nhóm/team/hạn lấy từ iam-structure.json (đã được quản lý trực tiếp phê duyệt qua PR).
set -euo pipefail
cd "$(dirname "$0")/.."

USER_NAME="$1"
ROW=$(jq -c --arg u "$USER_NAME" '.users[] | select(.name==$u)' iam-structure.json)
[ -n "$ROW" ] || { echo "LỖI: $USER_NAME chưa có trong iam-structure.json (chưa được phê duyệt)"; exit 1; }

TEAM=$(echo "$ROW" | jq -r '.team')
EXPIRES=$(echo "$ROW" | jq -r '.expires // empty')
USER_GROUPS=$(echo "$ROW" | jq -r '.groups[]')

# Bẫy "một người thuộc hai nhóm mâu thuẫn": mỗi người chỉ được đúng MỘT nhóm công việc.
JOB_COUNT=$(jq -n --argjson row "$ROW" --slurpfile s iam-structure.json \
  '[$row.groups[] | select(. as $g | $s[0].job_groups | index($g))] | length')
if [ "$JOB_COUNT" -ne 1 ]; then
  echo "LỖI: $USER_NAME thuộc $JOB_COUNT nhóm công việc - quy định chỉ 1. Cần ngoại lệ được phê duyệt."
  exit 1
fi

echo "1) Tạo user cá nhân + gắn thẻ truy vết"
TAGS="Key=Team,Value=$TEAM Key=CreatedBy,Value=${CREATED_BY:-unknown} Key=Ticket,Value=${TICKET:-none}"
[ -n "$EXPIRES" ] && TAGS="$TAGS Key=AccessExpiresOn,Value=$EXPIRES"
aws iam create-user --user-name "$USER_NAME" --tags $TAGS >/dev/null

echo "2) Thêm vào nhóm (không bao giờ gắn chính sách trực tiếp vào user)"
for g in $USER_GROUPS; do aws iam add-user-to-group --user-name "$USER_NAME" --group-name "$g"; done

echo "3) Mật khẩu tạm, bắt buộc đổi ở lần đăng nhập đầu"
TMP_PW=$(openssl rand -base64 24)
aws iam create-login-profile --user-name "$USER_NAME" --password "$TMP_PW" --password-reset-required >/dev/null
echo "   Mật khẩu tạm (gửi qua kênh riêng, hết hiệu lực sau lần đăng nhập đầu): $TMP_PW"

echo "4) Người dùng tự đăng ký MFA (chính sách ShopFast-SelfService cho phép đúng thiết bị mfa/$USER_NAME)"
echo "5) Kiểm tra lại quyền thực tế:"
aws iam list-groups-for-user --user-name "$USER_NAME" --query 'Groups[].GroupName' --output text
[ -n "$EXPIRES" ] && echo "   Đối tác: quyền tự hết hạn lúc $EXPIRES (Deny theo aws:CurrentTime); lịch chạy offboard.sh cùng ngày."
echo "Hoàn tất cấp quyền cho $USER_NAME"

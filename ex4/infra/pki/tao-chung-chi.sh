#!/usr/bin/env bash
set -euo pipefail
# Tạo CA nội bộ (tự quản, không tốn phí AWS Private CA) và chứng chỉ cho tác vụ cron.
# Khoá riêng của CA cất ngoại tuyến; KHÔNG commit *.key vào git.

# 1. CA (10 năm)
openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes \
  -keyout shopfast-onprem-ca.key -out shopfast-onprem-ca.crt \
  -subj "/O=ShopFast/CN=ShopFast On-Prem CA" \
  -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"

# 2. Chứng chỉ cho tác vụ (1 năm) - CN phải khớp điều kiện aws:PrincipalTag/x509Subject/CN
openssl req -newkey rsa:2048 -nodes -keyout invoice-cron.key -out invoice-cron.csr \
  -subj "/O=ShopFast/CN=shopfast-invoice-cron"
openssl x509 -req -in invoice-cron.csr -CA shopfast-onprem-ca.crt -CAkey shopfast-onprem-ca.key \
  -CAcreateserial -days 365 -sha256 \
  -extfile <(printf "basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature\n")

# 3. Đặt lên máy chủ
sudo install -o invoice-cron -m 600 invoice-cron.key /etc/shopfast/pki/invoice-cron.key
sudo install -o invoice-cron -m 644 invoice-cron.crt /etc/shopfast/pki/invoice-cron.crt

# Gia hạn: lịch nhắc 30 ngày trước hạn (chứng chỉ 1 năm/lần = 1 thao tác/năm cho 3 kỹ sư vận hành).
# Thu hồi khẩn cấp: tắt trust anchor hoặc gắn CRL: aws rolesanywhere import-crl ...

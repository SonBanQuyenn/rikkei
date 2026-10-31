#!/usr/bin/env bash
# Quay lui ve phien ban truoc: ./rollback.sh
#  - Mau cu con chay (trong cua so quan sat): chi chuyen luong nginx -> vai giay
#  - Mau cu da tat: bat lai 4 container tag cu (~25-30s) roi chuyen luong -> < 1 phut
# Khong can migration nguoc vi migration chi o dang EXPAND (phien ban cu van doc/ghi duoc).
source "$(dirname "$0")/lib.sh"

if [ "${1:-}" = "--locked" ]; then
  # Duoc deploy.sh goi bang exec: khoa da duoc giu, chi can nho giai phong khi xong
  trap 'rm -rf "$STATE_DIR/.lock"' EXIT
else
  acquire_lock "rollback"
fi

BAD="$(state_get active_color blue)"
BAD_TAG="$(state_get active_tag "")"
GOOD="$(state_get previous_color "")"
GOOD_TAG="$(state_get previous_tag "")"
[ -n "$GOOD" ] && [ -n "$GOOD_TAG" ] || { log "Khong co phien ban truoc de quay lui"; exit 1; }

START=$(date +%s)
log "Quay lui: $BAD ($BAD_TAG) -> $GOOD ($GOOD_TAG)"

if [ "$(running_count "$GOOD")" -lt "$REPLICAS" ]; then
  log "$GOOD da tat -> bat lai $GOOD_TAG"
  assert_budget "$REPLICAS"
  app_compose "$GOOD" "$GOOD_TAG" up -d --wait --wait-timeout 90
fi

switch_traffic "$GOOD"
state_set active_tag "$GOOD_TAG"
state_set previous_color "$BAD"
state_set previous_tag "$BAD_TAG"
log "Da quay lui ve $GOOD_TAG sau $(( $(date +%s) - START ))s"

# Cho worker nginx cu xu ly xong request dang do tren mau loi truoc khi tat no
sleep 10
# Tat mau loi: SIGTERM -> app bao client realtime ket noi lai (sang mau tot), roi moi dung
app_compose "$BAD" "$BAD_TAG" down --timeout 60
log "Da tat $BAD ($BAD_TAG)"

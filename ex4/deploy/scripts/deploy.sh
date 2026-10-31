#!/usr/bin/env bash
# Trien khai blue-green: ./deploy.sh <image_tag>
#
# 1. Kiem tra ngan sach (4 dang chay + 4 moi <= 8)
# 2. Migration EXPAND (tuong thich nguoc, phien ban cu van chay)
# 3. Bat 4 container mau moi, cho ca 4 healthy (~25-30 giay)
# 4. Smoke test truc tiep mau moi
# 5. Chuyen luong nginx (reload graceful, khong cat ket noi dang mo)
# 6. Kiem tra sau chuyen luong; loi -> tu dong chuyen ve mau cu
# 7. GIU mau cu chay de quay lui tuc thi; finalize.sh tat no sau cua so quan sat
source "$(dirname "$0")/lib.sh"

TAG="${1:?Cach dung: deploy.sh <image_tag>}"
acquire_lock "deploy $TAG"

ACTIVE="$(state_get active_color blue)"
ACTIVE_TAG="$(state_get active_tag "")"
IDLE="$(other_color "$ACTIVE")"
log "Dang chay: $ACTIVE ($ACTIVE_TAG) | se trien khai $TAG len $IDLE"

# Mau idle con container cua lan truoc (chua finalize) -> tat truoc de giu ngan sach
if [ "$(running_count "$IDLE")" -gt 0 ]; then
  log "$IDLE con container cu cua lan truoc -> tat gon (drain) truoc"
  app_compose "$IDLE" "$(state_get previous_tag none)" down --timeout 60
fi
assert_budget "$REPLICAS"

# --- 2. Migration expand ---
"$DEPLOY_DIR/scripts/migrate.sh"

# --- 3. Bat mau moi ---
START=$(date +%s)
if ! app_compose "$IDLE" "$TAG" up -d --wait --wait-timeout 120; then
  log "Mau $IDLE khong healthy -> huy, $ACTIVE van phuc vu binh thuong"
  app_compose "$IDLE" "$TAG" down --timeout 10
  exit 1
fi
log "4 container $IDLE healthy sau $(( $(date +%s) - START ))s (tong container: $(total_running))"

# --- 4. Smoke test truc tiep ---
if ! color_health "$IDLE" | grep -q '"status":"ok"'; then
  log "Smoke test $IDLE that bai -> huy"
  app_compose "$IDLE" "$TAG" down --timeout 10
  exit 1
fi

# --- 5. Chuyen luong ---
switch_traffic "$IDLE"
state_set previous_color "$ACTIVE"
state_set previous_tag "$ACTIVE_TAG"
state_set active_tag "$TAG"

# --- 6. Kiem tra sau chuyen luong (30 giay) ---
for _ in $(seq 1 10); do
  if ! public_health | grep -q "\"version\":\"$TAG\""; then
    log "Kiem tra sau chuyen luong that bai -> tu dong quay lui"
    exec "$DEPLOY_DIR/scripts/rollback.sh" --locked
  fi
  sleep 3
done

log "Trien khai $TAG thanh cong. $ACTIVE ($ACTIVE_TAG) van chay de quay lui tuc thi."
log "Sau cua so quan sat (15 phut) chay: scripts/finalize.sh"

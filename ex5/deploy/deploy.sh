#!/usr/bin/env bash
# Chay tren server qua SSH tu pipeline:  ./deploy.sh <image_tag>
# Ma thoat: 0 = thanh cong | 1 = loi truoc khi doi phien ban | 2 = da TU DONG QUAY LUI
set -euo pipefail

TAG="${1:?Thieu image tag}"
DIR="${DEPLOY_DIR:-$(cd "$(dirname "$0")" && pwd)}"
cd "$DIR"
mkdir -p state

# Nap cau hinh theo thu tu: dung chung -> rieng moi truong (ghi de) -> phan bien so (IMAGE_TAG)
set -a
source ./shared.env
source ./env.env
IMAGE_TAG="$TAG"
set +a

log() { echo "[deploy $(date +%H:%M:%S)] $*"; }

# Khong cho hai lan trien khai chong nhau tren cung server
if ! mkdir state/.lock 2>/dev/null; then log "Dang co lan trien khai khac"; exit 1; fi
trap 'rm -rf state/.lock' EXIT

PREVIOUS_TAG="$(cat state/current_tag 2>/dev/null || true)"
log "$DEPLOY_ENV: ${PREVIOUS_TAG:-<chua co>} -> $TAG"

docker compose pull -q api
docker compose up -d --wait --wait-timeout 60 api || log "Container chua healthy, de verify.sh quyet dinh"

if ./verify.sh "http://127.0.0.1:${HOST_PORT}" "$TAG"; then
  [ -n "$PREVIOUS_TAG" ] && [ "$PREVIOUS_TAG" != "$TAG" ] && echo "$PREVIOUS_TAG" > state/previous_tag
  echo "$TAG" > state/current_tag
  echo "$(date -Iseconds) OK $TAG" >> state/history.log
  log "Trien khai $TAG thanh cong"
  exit 0
fi

# ---- TU DONG QUAY LUI ----
echo "$(date -Iseconds) FAIL $TAG" >> state/history.log
if [ -z "$PREVIOUS_TAG" ]; then
  log "Khong co phien ban truoc de quay lui"
  exit 1
fi
log "TU DONG QUAY LUI ve $PREVIOUS_TAG"
START=$(date +%s)
IMAGE_TAG="$PREVIOUS_TAG" docker compose up -d --wait --wait-timeout 60 api
VERIFY_DURATION_SECONDS=10 ./verify.sh "http://127.0.0.1:${HOST_PORT}" "$PREVIOUS_TAG"
echo "$(date -Iseconds) ROLLBACK $TAG -> $PREVIOUS_TAG" >> state/history.log
log "Da quay lui ve $PREVIOUS_TAG sau $(( $(date +%s) - START ))s"
exit 2

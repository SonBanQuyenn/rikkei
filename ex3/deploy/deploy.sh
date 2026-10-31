#!/usr/bin/env bash
# Chay tren server (staging hoac production) qua SSH tu pipeline.
#   ./deploy.sh <image_tag>               -> trien khai binh thuong (co migration)
#   ./deploy.sh <image_tag> --rollback    -> quay lui: bo qua migration, chi doi image
set -euo pipefail

TAG="${1:?Thieu image tag}"
MODE="${2:-deploy}"
APP_DIR=/opt/shopfast
cd "$APP_DIR"

# Khoa tren server: du pipeline co bi chay song song (chay tay, rollback...) thi
# hai lan trien khai cung khong bao gio chong len nhau
exec 9>"$APP_DIR/.deploy.lock"
flock -w 600 9 || { echo "Dang co lan trien khai khac, het thoi gian cho"; exit 1; }

CURRENT_TAG="$(cat .current_tag 2>/dev/null || true)"
echo "Moi truong: ${DEPLOY_ENV:-unknown} | hien tai: ${CURRENT_TAG:-<chua co>} -> moi: $TAG ($MODE)"

export IMAGE_TAG="$TAG"
docker compose pull api

if [ "$MODE" != "--rollback" ]; then
  # Production: sao luu truoc khi doi cau truc DB
  if [ "${DEPLOY_ENV:-}" = "production" ]; then
    mkdir -p backups
    BACKUP_FILE="backups/before-${TAG}-$(date +%Y%m%d%H%M%S).dump"
    docker run --rm --env-file .env postgres:16-alpine \
      sh -c 'pg_dump -Fc "$DATABASE_URL"' > "$BACKUP_FILE"
    echo "Da sao luu DB: $BACKUP_FILE"
  fi

  # Migration chay bang image MOI nhung TRUOC khi doi container.
  # Moi file migration nam trong 1 transaction -> loi giua chung se ROLLBACK.
  # Neu fail: dung tai day, container cu van phuc vu, khong co trang thai nua voi.
  if ! docker compose run --rm --no-deps api node dist/migrate.js; then
    echo "Migration that bai -> giu nguyen phien ban ${CURRENT_TAG:-hien tai}, dung trien khai"
    exit 1
  fi
fi

docker compose up -d --no-deps api

# Kiem tra suc khoe phien ban moi (toi da 60 giay)
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:3000/health >/dev/null; then
    [ -n "$CURRENT_TAG" ] && [ "$CURRENT_TAG" != "$TAG" ] && echo "$CURRENT_TAG" > .previous_tag
    echo "$TAG" > .current_tag
    echo "Trien khai $TAG thanh cong"
    exit 0
  fi
  sleep 2
done

echo "Health check that bai cho $TAG"
if [ -n "$CURRENT_TAG" ]; then
  echo "Tu dong quay ve $CURRENT_TAG"
  IMAGE_TAG="$CURRENT_TAG" docker compose up -d --no-deps api
fi
exit 1

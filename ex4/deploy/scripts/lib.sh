#!/usr/bin/env bash
# Ham dung chung cho deploy.sh / rollback.sh / finalize.sh
set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
STATE_DIR="$DEPLOY_DIR/state"
UPSTREAM_FILE="$DEPLOY_DIR/nginx/upstream/active.conf"
MAX_CONTAINERS=8          # ngan sach: toi da gap doi 4 container
REPLICAS=4
mkdir -p "$STATE_DIR"

log() { echo "[$(date +%H:%M:%S)] $*"; }

state_get() { cat "$STATE_DIR/$1" 2>/dev/null || echo "${2:-}"; }
state_set() { echo "$2" > "$STATE_DIR/$1"; }

other_color() { [ "$1" = "blue" ] && echo green || echo blue; }

# docker compose cho moi truong blue/green
app_compose() {
  local color="$1" tag="$2"; shift 2
  COLOR="$color" IMAGE_TAG="$tag" docker compose \
    -p "shopfast-$color" -f "$DEPLOY_DIR/docker-compose.app.yml" "$@"
}

edge_compose() {
  docker compose -p shopfast-edge -f "$DEPLOY_DIR/docker-compose.edge.yml" "$@"
}

running_count() {
  docker ps -q --filter "label=com.docker.compose.project=shopfast-$1" \
    --filter "label=com.docker.compose.service=api" | wc -l | tr -d ' '
}

total_running() {
  echo $(( $(running_count blue) + $(running_count green) ))
}

# Kiem tra ngan sach truoc khi bat them container
assert_budget() {
  local extra="$1" now
  now="$(total_running)"
  if [ $(( now + extra )) -gt "$MAX_CONTAINERS" ]; then
    log "VUOT NGAN SACH: dang chay $now, can them $extra, toi da $MAX_CONTAINERS"
    exit 1
  fi
}

# Chuyen luong nginx sang mau chi dinh: kiem tra cu phap truoc, reload graceful
switch_traffic() {
  local color="$1"
  local backup="$UPSTREAM_FILE.bak"
  cp "$UPSTREAM_FILE" "$backup"
  echo "upstream shopfast_api { server api-$color:3000; keepalive 64; }" > "$UPSTREAM_FILE"
  if ! edge_compose exec -T nginx nginx -t -q; then
    cp "$backup" "$UPSTREAM_FILE"
    log "Cau hinh nginx loi, giu nguyen luong cu"
    return 1
  fi
  edge_compose exec -T nginx nginx -s reload
  state_set active_color "$color"
  log "Da chuyen luong sang $color"
}

# Goi /health qua nginx (duong di that cua nguoi dung)
public_health() {
  edge_compose exec -T nginx wget -qO- http://127.0.0.1/health
}

# Goi /health truc tiep vao mot mau (truoc khi chuyen luong)
color_health() {
  edge_compose exec -T nginx wget -qO- "http://api-$1:3000/health"
}

# Khoa: khong cho hai lan deploy/rollback chay chong nhau
acquire_lock() {
  if ! mkdir "$STATE_DIR/.lock" 2>/dev/null; then
    log "Dang co thao tac trien khai khac ($(cat "$STATE_DIR/.lock/owner" 2>/dev/null))"
    exit 1
  fi
  echo "$1 pid=$$" > "$STATE_DIR/.lock/owner"
  trap 'rm -rf "$STATE_DIR/.lock"' EXIT
}

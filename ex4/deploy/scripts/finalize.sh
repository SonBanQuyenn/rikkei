#!/usr/bin/env bash
# Ket thuc cua so quan sat: tat mau cu mot cach gon gang.
#   ./finalize.sh
# docker compose down gui SIGTERM -> moi container cu:
#   - /health tra 503 (nginx khong gui request moi)
#   - gui {"type":"reconnect","retryAfterMs":0..10000} cho tung client WebSocket
#   - client mo ket noi moi (vao mau dang active) roi moi dong ket noi cu
#   - toi da 45 giay drain, stop_grace_period 60 giay
# -> nguoi dung dang ket noi realtime khong bi mat ket noi dot ngot.
source "$(dirname "$0")/lib.sh"
acquire_lock "finalize"

OLD="$(state_get previous_color "")"
OLD_TAG="$(state_get previous_tag "")"
[ -n "$OLD" ] || { log "Khong co mau cu can tat"; exit 0; }
[ "$OLD" != "$(state_get active_color blue)" ] || { log "Mau cu dang la mau active, dung lai"; exit 1; }

log "Drain va tat $OLD ($OLD_TAG)"
app_compose "$OLD" "${OLD_TAG:-none}" down --timeout 60
log "Xong. Dang chay: $(state_get active_color) ($(state_get active_tag)), tong container: $(total_running)"

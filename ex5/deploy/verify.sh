#!/usr/bin/env bash
# Kiem tra sau trien khai. Thoat 0 = dat, 1 = phai quay lui.
#   ./verify.sh <base_url> <expected_version>
#
# Trong VERIFY_DURATION_SECONDS giay, moi giay:
#   - GET /health          -> dem so lan loi LIEN TIEP
#   - GET /products, /products/1 (probe nghiep vu) -> ghi status + do tre
# Tieu chi THAT BAI (bat ky dieu kien nao):
#   1. /health loi >= HEALTH_FAIL_LIMIT lan lien tiep
#   2. /health tra version khac phien ban vua trien khai (chay nham image)
#   3. Ti le loi probe (5xx / loi ket noi) > VERIFY_MAX_ERROR_RATE %
#   4. Do tre p95 cua probe > VERIFY_MAX_P95_MS ms
#   5. Ti le 5xx cua luu luong THAT (/metrics) trong luc quan sat > VERIFY_MAX_ERROR_RATE %
set -uo pipefail

BASE_URL="${1:?Thieu base_url}"
EXPECTED_VERSION="${2:?Thieu expected_version}"
DURATION="${VERIFY_DURATION_SECONDS:-60}"
HEALTH_FAIL_LIMIT="${HEALTH_FAIL_LIMIT:-3}"
MAX_ERROR_RATE="${VERIFY_MAX_ERROR_RATE:-5}"
MAX_P95_MS="${VERIFY_MAX_P95_MS:-800}"

log() { echo "[verify $(date +%H:%M:%S)] $*"; }
metric() { curl -fsS -m 3 "$BASE_URL/metrics" 2>/dev/null | sed -n "s/.*\"$1\":\([0-9]*\).*/\1/p"; }

log "Quan sat $BASE_URL trong ${DURATION}s (version $EXPECTED_VERSION)"
log "Nguong: health loi lien tiep < $HEALTH_FAIL_LIMIT, loi <= ${MAX_ERROR_RATE}%, p95 <= ${MAX_P95_MS}ms"

req_before="$(metric requestsTotal)"; err_before="$(metric errors5xxTotal)"
consecutive_health_fail=0
probes=0; probe_errors=0
latencies=()

for _ in $(seq 1 "$DURATION"); do
  health="$(curl -sS -m 3 "$BASE_URL/health" 2>/dev/null || true)"
  if echo "$health" | grep -q '"status":"ok"'; then
    consecutive_health_fail=0
    if ! echo "$health" | grep -q "\"version\":\"$EXPECTED_VERSION\""; then
      log "THAT BAI: /health tra $health, mong doi version $EXPECTED_VERSION"
      exit 1
    fi
  else
    consecutive_health_fail=$((consecutive_health_fail + 1))
    log "health loi lan $consecutive_health_fail lien tiep"
    if [ "$consecutive_health_fail" -ge "$HEALTH_FAIL_LIMIT" ]; then
      log "THAT BAI: /health loi $consecutive_health_fail lan lien tiep"
      exit 1
    fi
  fi

  for path in /products /products/1; do
    # Dong cuoi = "<http_code> <giay>"; loi ket noi/timeout -> http_code 000
    out="$(curl -s -m 5 -w '\n%{http_code} %{time_total}' "$BASE_URL$path" | tail -n 1)"
    code="${out%% *}"; seconds="${out##* }"
    probes=$((probes + 1))
    latencies+=("$(awk -v s="$seconds" 'BEGIN { printf "%d", s * 1000 }')")
    if [ "$code" = "000" ] || [ "$code" -ge 500 ]; then probe_errors=$((probe_errors + 1)); fi
  done
  sleep 1
done

error_rate=$(( probe_errors * 100 / probes ))
p95_index=$(( (probes * 95 + 99) / 100 ))
p95=$(printf '%s\n' "${latencies[@]}" | sort -n | sed -n "${p95_index}p")

req_after="$(metric requestsTotal)"; err_after="$(metric errors5xxTotal)"
real_requests=$(( ${req_after:-0} - ${req_before:-0} ))
real_errors=$(( ${err_after:-0} - ${err_before:-0} ))
real_error_rate=0
[ "$real_requests" -gt 0 ] && real_error_rate=$(( real_errors * 100 / real_requests ))

log "Probe: $probes request, $probe_errors loi (${error_rate}%), p95 ${p95}ms"
log "Luu luong that (/metrics): $real_requests request, $real_errors loi 5xx (${real_error_rate}%)"

failed=0
[ "$error_rate" -gt "$MAX_ERROR_RATE" ] && { log "THAT BAI: ti le loi probe ${error_rate}% > ${MAX_ERROR_RATE}%"; failed=1; }
[ "${p95:-0}" -gt "$MAX_P95_MS" ] && { log "THAT BAI: p95 ${p95}ms > ${MAX_P95_MS}ms"; failed=1; }
[ "$real_error_rate" -gt "$MAX_ERROR_RATE" ] && { log "THAT BAI: ti le 5xx that ${real_error_rate}% > ${MAX_ERROR_RATE}%"; failed=1; }
[ "$failed" -eq 0 ] && log "DAT: phien ban $EXPECTED_VERSION on dinh"
exit "$failed"

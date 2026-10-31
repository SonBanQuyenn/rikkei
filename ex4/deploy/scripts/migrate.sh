#!/usr/bin/env bash
# Chay cac migration chua chay.
#   ./migrate.sh                 -> chi chay EXPAND (bo qua file *_contract_*)
#   ./migrate.sh --with-contract -> chay ca CONTRACT (chi dung khi phien ban cu da tat han)
# Moi file chay trong 1 transaction (--single-transaction): loi -> ROLLBACK, schema khong doi.
source "$(dirname "$0")/lib.sh"

MIGRATIONS_DIR="$DEPLOY_DIR/../migrations"
WITH_CONTRACT="${1:-}"

psql_run() {
  docker run --rm -i --network shopfast --env-file "$DEPLOY_DIR/.env" postgres:16-alpine \
    sh -c 'psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q "$@"' psql "$@"
}

psql_run -c "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())"
applied="$(psql_run -At -c "SELECT name FROM schema_migrations")"

for file in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  name="$(basename "$file")"
  if grep -qx "$name" <<< "$applied"; then continue; fi
  if [[ "$name" == *_contract_* && "$WITH_CONTRACT" != "--with-contract" ]]; then
    log "Bo qua $name (contract - chay o lan trien khai sau)"
    continue
  fi
  log "Migration $name"
  { cat "$file"; echo; echo "INSERT INTO schema_migrations (name) VALUES ('$name');"; } \
    | psql_run --single-transaction -f -
done
log "Migration xong"

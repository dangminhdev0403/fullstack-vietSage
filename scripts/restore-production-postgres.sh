#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  printf 'Usage: %s BACKUP.dump NEW_DATABASE_NAME\n' "$0" >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
ENV_FILE="secrets/production/postgres.env"
BACKUP_PATH="$1"
TARGET_DB="$2"

[[ -f "$ENV_FILE" ]] || { printf 'Missing %s\n' "$ENV_FILE" >&2; exit 1; }
[[ -s "$BACKUP_PATH" ]] || { printf 'Backup does not exist or is empty: %s\n' "$BACKUP_PATH" >&2; exit 1; }
[[ "$TARGET_DB" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || { printf 'Invalid target database name\n' >&2; exit 2; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"

[[ "$TARGET_DB" != "$POSTGRES_DB" ]] || { printf 'Target database must differ from the source database\n' >&2; exit 2; }
if docker compose -f docker-compose.prod.yml exec -T postgres \
  psql --username "$POSTGRES_USER" --dbname postgres --tuples-only --no-align \
  --command "SELECT 1 FROM pg_database WHERE datname = '$TARGET_DB'" | grep -qx 1; then
  printf 'Refusing restore: target database already exists: %s\n' "$TARGET_DB" >&2
  exit 1
fi

docker compose -f docker-compose.prod.yml exec -T postgres \
  createdb --username "$POSTGRES_USER" --template template0 "$TARGET_DB"

if ! docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore --username "$POSTGRES_USER" --dbname "$TARGET_DB" \
  --no-owner --no-privileges --exit-on-error < "$BACKUP_PATH"; then
  printf 'Restore failed; target database remains for forensic inspection: %s\n' "$TARGET_DB" >&2
  exit 1
fi

printf 'Restored %s into new database %s\n' "$BACKUP_PATH" "$TARGET_DB"

#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
ENV_FILE="secrets/production/postgres.env"
OUTPUT_DIR="${BACKUP_DIR:-$ROOT_DIR/backups/postgres}"

[[ -f "$ENV_FILE" ]] || { printf 'Missing %s\n' "$ENV_FILE" >&2; exit 1; }
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
: "${POSTGRES_DB:?POSTGRES_DB is required}"
: "${POSTGRES_USER:?POSTGRES_USER is required}"

mkdir -p "$OUTPUT_DIR"
umask 077
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="$OUTPUT_DIR/${POSTGRES_DB}-${timestamp}.dump"
tmp_path="${backup_path}.tmp"
trap 'rm -f "$tmp_path"' EXIT

docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --format=custom --compress=9 --no-owner --no-privileges > "$tmp_path"

test -s "$tmp_path"
mv "$tmp_path" "$backup_path"
sha256sum "$backup_path" > "${backup_path}.sha256"
trap - EXIT
printf '%s\n' "$backup_path"

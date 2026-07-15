#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

MODE="${1:-renew}"
case "$MODE" in
  dry-run)
    RENEW_ARGS=(renew --dry-run)
    ;;
  renew)
    RENEW_ARGS=(renew --quiet)
    ;;
  *)
    printf 'Usage: %s [dry-run|renew]\n' "$0" >&2
    exit 2
    ;;
esac

docker compose -f docker-compose.prod.yml --profile tls-tools run --rm certbot "${RENEW_ARGS[@]}"
docker compose -f docker-compose.prod.yml exec -T nginx nginx -t
docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload

printf 'Certificate %s completed and Nginx reloaded.\n' "$MODE"

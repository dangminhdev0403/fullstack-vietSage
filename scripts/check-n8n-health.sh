#!/usr/bin/env bash
set -euo pipefail

url="${1:-http://127.0.0.1:5678/healthz/readiness}"
max_seconds="${2:-3}"
result="$(curl --silent --show-error --write-out $'\n%{http_code} %{time_total}' --max-time "$max_seconds" "$url")" || {
  printf 'CRITICAL n8n readiness request failed: %s\n' "$url" >&2
  exit 2
}
read -r status elapsed <<<"${result##*$'\n'}"
if [[ "$status" != "200" ]]; then
  printf 'CRITICAL n8n readiness returned HTTP %s in %ss\n' "$status" "$elapsed" >&2
  exit 2
fi
printf 'OK n8n readiness HTTP 200 in %ss\n' "$elapsed"
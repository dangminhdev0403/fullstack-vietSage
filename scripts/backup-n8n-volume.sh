#!/usr/bin/env bash
set -euo pipefail

umask 077
container="${N8N_CONTAINER_NAME:-vietsage-n8n}"
backup_dir="${BACKUP_DIR:-$PWD/secrets/backups}"
health_url="${N8N_HEALTH_URL:-http://127.0.0.1:${N8N_LOCAL_PORT:-5678}/healthz/readiness}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="n8n-${timestamp}.tar.gz"

volume="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/home/node/.n8n"}}{{.Name}}{{end}}{{end}}' "$container")"
if [[ -z "$volume" ]]; then
  printf 'n8n data volume not found on container %s\n' "$container" >&2
  exit 1
fi

mkdir -p "$backup_dir"
was_running="$(docker inspect --format '{{.State.Running}}' "$container")"
restart_if_needed() {
  if [[ "$was_running" == "true" ]]; then
    docker start "$container" >/dev/null 2>&1 || true
  fi
}
trap restart_if_needed EXIT

if [[ "$was_running" == "true" ]]; then
  docker stop "$container" >/dev/null
fi

docker run --rm \
  -v "$volume:/data:ro" \
  -v "$backup_dir:/backup" \
  alpine:3.22 \
  sh -lc "cd /data && tar -czf /backup/$archive ."

restart_if_needed
trap - EXIT
if [[ "$was_running" == "true" ]]; then
  ready=false
  for _ in $(seq 1 60); do
    if curl --silent --fail --max-time 2 "$health_url" >/dev/null; then
      ready=true
      break
    fi
    sleep 1
  done
  if [[ "$ready" != "true" ]]; then
    printf 'n8n did not become ready after backup: %s\n' "$health_url" >&2
    exit 1
  fi
fi
sha256sum "$backup_dir/$archive" > "$backup_dir/$archive.sha256"
printf '%s\n' "$backup_dir/$archive"
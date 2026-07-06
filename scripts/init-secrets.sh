#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

write_if_missing() {
  local file_path="$1"
  local content="$2"

  mkdir -p "$(dirname "$file_path")"
  if [[ -e "$file_path" ]]; then
    printf 'Giữ nguyên %s (đã tồn tại)\n' "${file_path#$ROOT_DIR/}"
    return 0
  fi

  printf '%s\n' "$content" > "$file_path"
  printf 'Đã tạo %s với key rỗng\n' "${file_path#$ROOT_DIR/}"
}

POSTGRES_TEMPLATE='POSTGRES_DB=
POSTGRES_USER=
POSTGRES_PASSWORD='

AUTH_SERVICE_TEMPLATE='DATABASE_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_TTL=
JWT_REFRESH_TTL=
CORS_ORIGINS=
AUTHZ_ENFORCEMENT_ENABLED=
AUTHZ_STRICT_MODE=
AUTHZ_ROUTE_SYNC_ENABLED=
AUTH_ADMIN_EMAIL=
AUTH_ADMIN_NAME=
AUTH_ADMIN_PASSWORD=
AUTH_LOGIN_RATE_LIMIT_TTL_SECONDS=
AUTH_LOGIN_RATE_LIMIT_LIMIT=
AUTH_REFRESH_RATE_LIMIT_TTL_SECONDS=
AUTH_REFRESH_RATE_LIMIT_LIMIT=
GOOGLE_APPLICATION_CREDENTIALS=
GOOGLE_SHEET_ID=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
SWAGGER_ENABLED=
LOG_LEVEL='

FRONTEND_TEMPLATE='NEXTAUTH_URL=
NEXTAUTH_SECRET=
AUTH_TRUST_HOST=
AUTH_API_BASE_URL=
NEXT_PUBLIC_AUTH_API_BASE_URL=
NEXT_PUBLIC_REALTIME_URL=
NEXT_PUBLIC_GUEST_DEFAULT_SERVICE_CATEGORY_ID='

for env_scope in docker production; do
  write_if_missing "$ROOT_DIR/secrets/$env_scope/postgres.env" "$POSTGRES_TEMPLATE"
  write_if_missing "$ROOT_DIR/secrets/$env_scope/auth-service.env" "$AUTH_SERVICE_TEMPLATE"
  write_if_missing "$ROOT_DIR/secrets/$env_scope/frontend.env" "$FRONTEND_TEMPLATE"
done

printf '\nCác file secrets/**/*.env đã bị gitignore. Điền giá trị thật trực tiếp trên máy local/VPS, không commit.\n'
printf 'Xem thêm: secrets/README.md\n'

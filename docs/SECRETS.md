# VietSage runtime secrets

Docker Compose là đường chạy production chính. Secret thật nằm trong `secrets/**` trên máy local/VPS và không commit lên git.

## Chính sách git

- Commit được: `docs/SECRETS.md`, `secrets/.gitkeep`, `secrets/docker/.gitkeep`, `secrets/production/.gitkeep`.
- Không commit: `secrets/**/*.env`, `secrets/**/*.json`, service account JSON, API keys, token, password, connection string.
- Các file `.env` dưới `secrets/docker/` và `secrets/production/` có thể chứa key rỗng để nhắc cấu hình, nhưng vẫn bị ignore.

## Cấu trúc

```text
secrets/
  docker/
    postgres.env
    auth-service.env
    frontend.env
    google-service-account.json        # optional, không commit
  production/
    postgres.env
    auth-service.env
    frontend.env
    google-service-account.json        # optional, không commit
```

`docker-compose.yml` đọc `./secrets/docker/*.env`.
`docker-compose.prod.yml` đọc `./secrets/production/*.env`.

## Tạo file key rỗng

```bash
bash scripts/init-secrets.sh
```

Script chỉ tạo file nếu chưa tồn tại và không ghi đè secret thật.

## `postgres.env`

```dotenv
POSTGRES_DB=
POSTGRES_USER=
POSTGRES_PASSWORD=
```

## `auth-service.env`

```dotenv
DATABASE_URL=
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
LOG_LEVEL=
```

Ghi chú: nếu bật Google Sheets sync, đặt credential JSON tại `secrets/<docker|production>/google-service-account.json` và set `GOOGLE_APPLICATION_CREDENTIALS` theo cách mount phù hợp trước khi chạy container. Compose hiện không mount file này mặc định để `docker compose config` không hỏng khi file vắng mặt.

## `frontend.env`

```dotenv
NEXTAUTH_URL=
NEXTAUTH_SECRET=
AUTH_TRUST_HOST=
AUTH_API_BASE_URL=
NEXT_PUBLIC_AUTH_API_BASE_URL=
NEXT_PUBLIC_REALTIME_URL=
NEXT_PUBLIC_GUEST_DEFAULT_SERVICE_CATEGORY_ID=
```

Trong production Docker, `AUTH_API_BASE_URL` được compose set mặc định là `http://auth-service:8080`; nếu cần override thì đặt trong env file.

## Deploy production

Trên VPS:

```bash
git pull
bash scripts/init-secrets.sh
# Điền giá trị thật vào secrets/production/*.env trên VPS, không commit.
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml up -d --build
```

Kiểm tra:

```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:3000 >/dev/null
```

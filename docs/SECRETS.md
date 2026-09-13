# VietSage runtime secrets

Docker Compose is the production/local-container runtime path. Real secrets live in ignored `secrets/docker/*.env` or `secrets/production/*.env` files on each machine/VPS and must not be committed.

## KBTT hotel credentials

- Set `KBTT_BASE_URL` to the provider HTTPS origin (no endpoint path). Set three runtime-only secrets on the backend: `KBTT_LOGIN_BASIC_AUTH_VALUE` (Get Token Basic value), `KBTT_TOKEN_BASIC_AUTH_VALUE` (Refresh/Revoke Basic value), both without the `Basic ` prefix, and `KBTT_CREDENTIAL_ENCRYPTION_KEY` (canonical base64 encoding of exactly 32 cryptographically random bytes). Never reuse JWT keys.
- Both absent disables new KBTT authentication; partial or malformed configuration fails module initialization. Never commit values or include them in command history, logs, browser storage, screenshots, or API responses.
- `KbttHotelConnection` stores username/password together as AES-256-GCM ciphertext, with a fresh 12-byte IV, 16-byte tag, key version 1, and hotel ID as authenticated associated data. Moving ciphertext to another hotel fails authentication. Only bounded CSLT metadata and safe status/timestamps remain readable.
- Access/refresh tokens exist only in backend process memory. GET is passive; only explicit owner connection/check actions authenticate or refresh. Restart or expiry does not start background login, polling, or scheduled guest submission.
- Key version 1 has no automatic rotation/keyring. Back up the encryption key separately under restricted access; losing/changing it makes saved credentials unreadable. Reconnect each hotel with its account after replacing the runtime key, or implement an explicitly reviewed re-encryption migration before rotating.
- Disconnect best-effort revokes the process-local provider token and deletes the saved connection. Provider outage/restart can leave an unavailable old token active remotely until its expiry; no token is persisted for later revocation.
- Review outbound HTTP tracing/proxy configuration: the provider requires refresh/access tokens in query strings on refresh/revoke. Do not record these URLs, Authorization headers, provider bodies, or form credentials. The adapter uses fixed HTTPS endpoints, rejects redirects, applies a 10-second timeout and a 64-KiB response limit, and exposes only stable sanitized failures.

## Local environment backup flow

Before committing environment-template changes, copy each service's real local `.env` into the repository-root `secrets/` folder:

```bash
cp services/auth-service/.env secrets/env_backend
cp frontends/front-end-vietsage/.env secrets/env_frontend
```

These copies are machine-local runtime backups. Both `secrets/env_backend` and `secrets/env_frontend` are ignored and must never be staged, committed, or pushed. Only sanitized templates such as `.env.example`, `.env.docker.example`, and `.env.production.example` belong in Git.

Verify the policy before committing:

```bash
git check-ignore -v secrets/env_backend secrets/env_frontend
git status --short --ignored -- secrets/env_backend secrets/env_frontend
```

## Git policy

Commit allowed:

- `docs/SECRETS.md`
- `secrets/.gitkeep`
- `secrets/docker/.gitkeep`
- `secrets/production/.gitkeep`
- non-secret skeleton/example files only

Do not commit:

- real `.env` files;
- service account JSON;
- API keys;
- tokens;
- passwords;
- connection strings;
- local backup files `secrets/env_backend` and `secrets/env_frontend`.

## Current runtime secret files

```txt
secrets/
  docker/
    postgres.env
    auth-service.env
    frontend.env
    google-service-account.json        # optional, ignored
  production/
    postgres.env
    auth-service.env
    frontend.env
    google-service-account.json        # optional, ignored
```

`docker-compose.yml` reads `./secrets/docker/*.env`.
`docker-compose.prod.yml` reads `./secrets/production/*.env`.

## Create empty local files

```bash
bash scripts/init-secrets.sh
```

The script creates files only when missing and does not overwrite existing real secrets.

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
GOOGLE_SERVICE_CATEGORY_RANGE="'Nhóm dịch vụ'!A1:Z"
GOOGLE_SERVICE_ITEM_RANGE="'Danh sách dịch vụ'!A1:Z"
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
SWAGGER_ENABLED=
LOG_LEVEL=
```

## `frontend.env`

```dotenv
NEXTAUTH_URL=
NEXTAUTH_SECRET=
AUTH_SECRET=
AUTH_TRUST_HOST=
AUTH_API_BASE_URL=
NEXT_PUBLIC_AUTH_API_BASE_URL=
NEXT_PUBLIC_REALTIME_URL=
NEXT_PUBLIC_GUEST_DEFAULT_SERVICE_CATEGORY_ID=
```

## Legacy tracked files

Historical files `secrets/env_backend` and `secrets/env_frontend` must not remain tracked. Keep their runtime values only in the ignored local files. Docker and production-specific runtime values belong in ignored `secrets/docker/*.env` or `secrets/production/*.env` files.

If a real value was ever committed, rotate that credential outside this repo.

## Deploy production

On VPS:

```bash
git pull
bash scripts/init-secrets.sh
# Fill real values directly in secrets/production/*.env on the VPS. Do not commit them.
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml up -d --build
```

Check:

```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:8080/health
curl -fsS http://127.0.0.1:3000 >/dev/null
```

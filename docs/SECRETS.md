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

## LocalMate knowledge API key

- `LOCALMATE_KNOWLEDGE_API_KEY`: machine-to-machine key (min 32 bytes), passed via `X-VietSage-Knowledge-Key`, server-to-server only, never exposed in client/browser.
- Used to authenticate external orchestrator/worker integrations (e.g. n8n) against `/localmate/knowledge` and `/localmate/tours`.
- Evaluated with constant-time equality check (`crypto.timingSafeEqual`). Never accept in query parameters, request bodies, or cookies.
- `LOCALMATE_N8N_WEBHOOK_SECRET`: separate server-to-server key used by the frontend BFF when calling n8n via `X-VietSage-Chat-Key`. Never reuse the knowledge key.
- `LOCALMATE_N8N_WEBHOOK_URL`: server-only n8n production webhook URL. Never expose either value through `NEXT_PUBLIC_*` variables.

## Channex channel manager

- `CHANNEX_BASE_URL` is server-only and accepts only `https://staging.channex.io/api/v1` or `https://app.channex.io/api/v1`. Use staging until certification and an approved production cutover.
- `CHANNEX_API_KEY` is sent only by the NestJS provider adapter in the `user-api-key` header. Never put it in a browser request, query string, database JSON, screenshot, log, or tracked file.
- `CHANNEX_WEBHOOK_URL` is the public HTTPS backend callback ending in `/api/v1/channel-manager/channex/webhook`. Content Sync registers it idempotently for the mapped property. A loopback/private URL cannot receive Channex callbacks; expose staging through the approved Tailscale Funnel/public ingress.
- `CHANNEX_WEBHOOK_SECRET` must contain at least 32 random characters. Configure the same value in Channex as custom header `X-Channex-Webhook-Secret`; the public callback rejects missing or mismatched values before parsing or applying a booking revision.
- A Channex key was previously present in local working source during development. Revoke/rotate it in Channex before staging verification; deleting the literal from Git does not revoke the credential.
- The Channel IFrame uses a server-created one-time token. It expires after 15 minutes before first use, is returned with `Cache-Control: no-store`, and must never be persisted in browser storage.
- The booking feed poller runs once per minute only when `CHANNEX_API_KEY` is configured. Webhooks provide low latency; polling drains missed revisions. Manual recovery remains time-scoped after a known outage over 30 minutes.

## Stripe payment gateway

- `STRIPE_CHECKOUT_ENABLED`: boolean flag (`true`/`false`) controlling whether online Stripe Checkout is enabled for LocalMate marketplace bookings. When `false`, attempting to create checkout sessions returns HTTP 503.
- `STRIPE_SECRET_KEY`: server-side restricted API key or secret key (`sk_test_...` in test/sandbox, `sk_live_...` or restricted `rk_live_...` in production). Must never be sent to the browser or committed to Git.
- `STRIPE_WEBHOOK_SECRET`: webhook signing secret (`whsec_...`) used to verify Stripe signatures on `POST /webhooks/stripe` via HMAC-SHA256 (`Stripe-Signature` header).
  - **Local development / Test mode**: Stripe cannot directly reach `localhost:8080`. Use Stripe CLI to forward events:
    ```bash
    stripe listen --forward-to localhost:8080/webhooks/stripe
    ```
    Stripe CLI outputs a session signing secret `whsec_...`. Use that value for `STRIPE_WEBHOOK_SECRET` in local `.env`.
  - **VPS / Production deployment**: Do NOT run Stripe CLI on VPS. Instead, configure an HTTPS webhook endpoint on Stripe Dashboard (**Developers** -> **Webhooks** -> **Add an endpoint**):
    - URL: `https://<api-domain>/webhooks/stripe`
    - Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`.
    - Retrieve the permanent `whsec_...` signing secret from the endpoint details and configure it on the VPS.
- `STRIPE_CHECKOUT_RETURN_BASE_URL`: base URL for redirection after customer finishes or cancels payment (e.g. `http://localhost:3000` locally, or `https://vietsage.com` in production). Must use `https:` in production.

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
    n8n.env
    google-service-account.json        # optional, ignored
  production/
    postgres.env
    auth-service.env
    frontend.env
    n8n.env
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
DATABASE_POOL_MAX=
DATABASE_CONNECTION_TIMEOUT_MS=
DATABASE_IDLE_TIMEOUT_MS=
DATABASE_LOCK_TIMEOUT_MS=
DATABASE_STATEMENT_TIMEOUT_MS=
DATABASE_QUERY_TIMEOUT_MS=
DATABASE_TRANSACTION_TIMEOUT_MS=
HTTP_REQUEST_TIMEOUT_MS=
HTTP_HEADERS_TIMEOUT_MS=
HTTP_KEEP_ALIVE_TIMEOUT_MS=
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
LOCALMATE_KNOWLEDGE_RATE_LIMIT_TTL_SECONDS=
LOCALMATE_KNOWLEDGE_RATE_LIMIT_LIMIT=
GOOGLE_APPLICATION_CREDENTIALS=
GOOGLE_SERVICE_CATEGORY_RANGE="'Nhóm dịch vụ'!A1:Z"
GOOGLE_SERVICE_ITEM_RANGE="'Danh sách dịch vụ'!A1:Z"
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
CHANNEX_BASE_URL=https://staging.channex.io/api/v1
CHANNEX_API_KEY=
CHANNEX_WEBHOOK_URL=
CHANNEX_WEBHOOK_SECRET=
SWAGGER_ENABLED=
LOG_LEVEL=
LOCALMATE_KNOWLEDGE_API_KEY=
STRIPE_CHECKOUT_ENABLED=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CHECKOUT_RETURN_BASE_URL=
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
LOCALMATE_N8N_WEBHOOK_URL=
LOCALMATE_N8N_WEBHOOK_SECRET=
```

## `n8n.env`

`N8N_ENCRYPTION_KEY` must match the key that encrypted the existing n8n credential database. Never replace it with a newly generated value during container migration.

```dotenv
N8N_ENCRYPTION_KEY=
N8N_HOST=127.0.0.1
N8N_PORT=5678
N8N_PROTOCOL=http
N8N_WEBHOOK_URL=http://127.0.0.1:5678/
N8N_EDITOR_BASE_URL=http://127.0.0.1:5678/
GENERIC_TIMEZONE=Asia/Ho_Chi_Minh
TZ=Asia/Ho_Chi_Minh
N8N_SECURE_COOKIE=false
N8N_DIAGNOSTICS_ENABLED=false
N8N_VERSION_NOTIFICATIONS_ENABLED=false
N8N_COMMUNITY_PACKAGES_ENABLED=false
N8N_UNVERIFIED_PACKAGES_ENABLED=false
N8N_TEMPLATES_ENABLED=false
N8N_PUBLIC_API_SWAGGERUI_DISABLED=true
N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
N8N_BLOCK_ENV_ACCESS_IN_NODE=true
N8N_SSRF_PROTECTION_ENABLED=true
N8N_SSRF_ALLOWED_HOSTNAMES=host.docker.internal,auth-service
NODES_EXCLUDE=["n8n-nodes-base.executeCommand","n8n-nodes-base.localFileTrigger","n8n-nodes-base.readWriteFile"]
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
EXECUTIONS_DATA_SAVE_ON_ERROR=all
EXECUTIONS_DATA_PRUNE=true
EXECUTIONS_DATA_MAX_AGE=168
EXECUTIONS_DATA_PRUNE_MAX_COUNT=10000
N8N_DEFAULT_BINARY_DATA_MODE=filesystem
```

LocalMate model credentials remain in n8n's encrypted credential store; model selection remains in the tracked workflow. Do not move either value into container env or enable `$env` access in workflow nodes.

Production uses the same encrypted credential store in the named `n8n_vietsage_data` volume. Generate a fresh `N8N_ENCRYPTION_KEY` directly on the VPS before the first start and back it up off-host; never copy a local instance key into production. The production frontend calls `http://n8n:5678/webhook/vietsage-localmate-knowledge` over the internal `automation` network, while the editor binds only to VPS loopback for SSH-tunnel access.

Production-specific values in `secrets/production/n8n.env` replace the local URLs and access policy:

```dotenv
N8N_HOST=0.0.0.0
N8N_WEBHOOK_URL=http://n8n:5678/
N8N_EDITOR_BASE_URL=http://127.0.0.1:5678/
N8N_PUBLIC_API_DISABLED=true
N8N_SSRF_ALLOWED_HOSTNAMES=auth-service
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

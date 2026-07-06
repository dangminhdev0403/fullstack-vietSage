# Secrets and Docker Production Env Consolidation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Chuẩn hóa toàn bộ `.env`/secret cho VietSage Web theo hướng Docker chính là production, secret thật lưu dưới `secrets/**`, không push git, không dùng `examples/**`.

**Architecture:** Repo chỉ commit cấu trúc thư mục, tài liệu, compose references, và `.env` template rỗng/không giá trị nếu cần. Secret thật nằm trong `secrets/production/*.env` và `secrets/docker/*.env`, được ignore khỏi git, dễ chỉnh trực tiếp trên VPS. Compose đọc env theo service, không hardcode secret trong YAML.

**Tech Stack:** Docker Compose, NestJS auth-service, Next.js frontend, PostgreSQL, Git ignore.

---

## Current Context

- User wants planning only for now; do not delegate or modify implementation yet.
- Docker is treated as production deployment path.
- User will save key names/templates under `secrets/**` to avoid forgetting and edit values on VPS.
- Secret files must not be pushed to git.
- User does not want `examples/**` directory.
- Current compose reads root env files:
  - `./.env.auth-service.docker`
  - `./.env.frontend.docker`
  - `./.env.auth-service.production`
  - `./.env.frontend.production`
- Current `docker-compose.yml` still hardcodes `NEXTAUTH_SECRET: replace-with-local-docker-nextauth-secret`.
- Current `docker-compose.prod.yml` gets `POSTGRES_PASSWORD` from shell interpolation, not service env file.

---

## Proposed Target Structure

```text
secrets/
  README.md                 # committed; explains rules, no real secret values
  .gitkeep                  # committed
  docker/
    .gitkeep                # committed
    postgres.env            # ignored; local docker values or blank keys
    auth-service.env        # ignored; local docker values or blank keys
    frontend.env            # ignored; local docker values or blank keys
    google-service-account.json # ignored, optional
  production/
    .gitkeep                # committed
    postgres.env            # ignored; VPS production values or blank keys
    auth-service.env        # ignored; VPS production values or blank keys
    frontend.env            # ignored; VPS production values or blank keys
    google-service-account.json # ignored, optional
```

## Git Policy

Commit:
- `secrets/README.md`
- `secrets/.gitkeep`
- `secrets/docker/.gitkeep`
- `secrets/production/.gitkeep`
- Compose changes
- Docs/runbook changes

Never commit:
- `secrets/**/*.env`
- `secrets/**/*.json`
- root `.env*` real files
- service account credentials

Optional local-only blank key files:
- `secrets/docker/*.env`
- `secrets/production/*.env`

These can contain key names with blank values, for example:

```dotenv
DATABASE_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
```

Because they are ignored, they will not be pushed.

---

## Env Ownership Model

### `secrets/production/postgres.env`

Purpose: variables for `postgres` container only.

Keys:

```dotenv
POSTGRES_DB=
POSTGRES_USER=
POSTGRES_PASSWORD=
```

### `secrets/production/auth-service.env`

Purpose: all runtime env required by NestJS backend.

Keys to include:

```dotenv
DATABASE_URL=
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRES_IN=
JWT_REFRESH_EXPIRES_IN=
CORS_ORIGINS=
SOCKET_CORS_ORIGINS=
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
GOOGLE_APPLICATION_CREDENTIALS=/run/secrets/google-service-account.json
GOOGLE_SHEET_ID=
TELEGRAM_BOT_TOKEN=
TELEGRAM_WEBHOOK_SECRET=
SWAGGER_ENABLED=
LOG_LEVEL=
```

Notes:
- `PORT` and `NODE_ENV` stay in compose because they are deployment constants, not secrets.
- `GOOGLE_APPLICATION_CREDENTIALS` should point to mounted container path, not host path.

### `secrets/production/frontend.env`

Purpose: all runtime env required by Next.js frontend.

Keys:

```dotenv
NEXTAUTH_URL=
NEXTAUTH_SECRET=
AUTH_API_BASE_URL=http://auth-service:8080
NEXT_PUBLIC_AUTH_API_BASE_URL=
NEXT_PUBLIC_REALTIME_URL=
NEXT_PUBLIC_GUEST_DEFAULT_SERVICE_CATEGORY_ID=
```

Notes:
- `AUTH_API_BASE_URL` internal server-side URL can stay `http://auth-service:8080` in production compose.
- Public URLs must match VPS/nginx domains.
- Avoid `AUTH_SECRET`; standardize on `NEXTAUTH_SECRET` only unless code proves otherwise.

### `secrets/docker/*.env`

Purpose: local Docker/dev-like deployment with same shape as production.

Rule:
- Same key names as production.
- Values can be local-only or blank.
- Never committed.

---

## Compose Design

### `docker-compose.yml`

Use local docker secrets:

```yaml
services:
  postgres:
    env_file:
      - ./secrets/docker/postgres.env

  auth-service:
    env_file:
      - ./secrets/docker/auth-service.env
    environment:
      NODE_ENV: production
      PORT: "8080"
      GOOGLE_APPLICATION_CREDENTIALS: /run/secrets/google-service-account.json
    volumes:
      - ./secrets/docker/google-service-account.json:/run/secrets/google-service-account.json:ro

  frontend:
    env_file:
      - ./secrets/docker/frontend.env
    environment:
      NODE_ENV: production
      PORT: "3000"
      HOSTNAME: 0.0.0.0
      AUTH_API_BASE_URL: http://auth-service:8080
```

Important:
- Remove hardcoded `NEXTAUTH_SECRET`.
- Remove duplicate frontend URL secrets from `environment` if they live in env file.
- Keep only non-secret constants in `environment`.

### `docker-compose.prod.yml`

Use production secrets:

```yaml
services:
  postgres:
    env_file:
      - ./secrets/production/postgres.env

  auth-service:
    env_file:
      - ./secrets/production/auth-service.env
    environment:
      NODE_ENV: production
      PORT: "8080"
      GOOGLE_APPLICATION_CREDENTIALS: /run/secrets/google-service-account.json
    volumes:
      - ./secrets/production/google-service-account.json:/run/secrets/google-service-account.json:ro

  frontend:
    env_file:
      - ./secrets/production/frontend.env
    environment:
      NODE_ENV: production
      PORT: "3000"
      HOSTNAME: 0.0.0.0
      AUTH_API_BASE_URL: http://auth-service:8080
```

Important:
- Do not use `${POSTGRES_PASSWORD:?}` in compose after moving Postgres env to `env_file`, because Compose interpolation reads host `.env`, not service `env_file`.
- If port overrides are needed, either keep shell interpolation with safe defaults or add a committed deploy note.

---

## Task Plan

### Task 1: Audit actual env keys

**Objective:** Build a definitive key list from code and compose before changing files.

**Files:**
- Read: `services/auth-service/src/common/config/env.config.ts`
- Read: `frontends/font-end-vietsage/src/lib/auth.ts`
- Read: `frontends/font-end-vietsage/src/core/http/backend-api-config.ts`
- Read: `docker-compose.yml`
- Read: `docker-compose.prod.yml`

**Steps:**
1. Extract backend env keys from `env.config.ts` and direct `process.env.*` usages.
2. Extract frontend env keys from `process.env.*` usages.
3. Classify keys into `postgres`, `auth-service`, `frontend`.
4. Mark each key as secret vs non-secret.
5. Confirm no `AUTH_SECRET` dependency remains unless code requires it.

**Verification:**
- Produce a short key inventory in `secrets/README.md`.
- No secret values included.

---

### Task 2: Update `.gitignore` for `secrets/**`

**Objective:** Ensure secret files can exist locally/VPS but never commit.

**Files:**
- Modify: `.gitignore`

**Required rules:**

```gitignore
# Runtime secrets and env files
secrets/**/*.env
secrets/**/*.json
!secrets/.gitkeep
!secrets/**/.gitkeep
!secrets/README.md

# Root/runtime env files
.env
.env.*
!.env.example
```

**Caution:**
- If current repo intentionally commits root `.env.*.example`, either leave exceptions temporarily or remove those files in cleanup task.

**Verification:**
- `git check-ignore -v secrets/production/auth-service.env` should show ignored.
- `git check-ignore -v secrets/README.md` should not ignore.

---

### Task 3: Create `secrets/` committed skeleton

**Objective:** Add only safe files to repo.

**Files:**
- Create: `secrets/.gitkeep`
- Create: `secrets/docker/.gitkeep`
- Create: `secrets/production/.gitkeep`
- Create: `secrets/README.md`

**README content requirements:**
- Explain files under `secrets/**/*.env` are ignored.
- Explain user should create/edit env files directly on VPS.
- Include blank-key templates as documentation only, not real values.
- Explain Google service account JSON path.
- Include deploy commands.

**Verification:**
- `git status --short secrets` shows only `.gitkeep` and `README.md` tracked candidates.
- No `.env` or `.json` secret file appears in git status.

---

### Task 4: Update compose env_file paths

**Objective:** Make Docker and production read secrets from `secrets/**`.

**Files:**
- Modify: `docker-compose.yml`
- Modify: `docker-compose.prod.yml`

**Changes:**
- `postgres` uses `env_file` instead of hardcoded `POSTGRES_*` values.
- `auth-service` uses `./secrets/docker/auth-service.env` or `./secrets/production/auth-service.env`.
- `frontend` uses `./secrets/docker/frontend.env` or `./secrets/production/frontend.env`.
- Remove hardcoded `NEXTAUTH_SECRET`.
- Mount Google credentials only if backend requires it.

**Verification:**
- With temporary local ignored env files present, run `docker compose -f docker-compose.yml config`.
- With temporary production ignored env files present, run `docker compose -f docker-compose.prod.yml config`.
- Confirm no secret literal appears in compose output except intentionally blank/test local values.

---

### Task 5: Cleanup old env examples and docs references

**Objective:** Remove/deprecate old scattered env files to avoid confusion.

**Files likely affected:**
- Remove or deprecate: `.env.auth-service.docker.example`
- Remove or deprecate: `.env.frontend.docker.example`
- Remove or deprecate: `.env.auth-service.production.example`
- Remove or deprecate: `.env.frontend.production.example`
- Remove or deprecate: `.env.production.example`
- Remove or deprecate: `.env.docker.example`
- Remove or deprecate: `services/auth-service/.env.docker.example`
- Keep or slim: `services/auth-service/.env.example` if used for non-Docker local dev
- Keep or slim: `frontends/font-end-vietsage/.env.example` if used for non-Docker local dev
- Modify: `deploy/README.md`
- Modify: root `README.md` if env instructions exist

**Rule:**
- No `examples/**` directory.
- Either remove duplicate examples or point them to `secrets/README.md`.

**Verification:**
- Searching `.env.auth-service.production` returns no active compose/doc references.
- Searching `.env.frontend.production` returns no active compose/doc references.

---

### Task 6: Add local helper script for blank secret files

**Objective:** Let user recreate blank key files without committing them.

**Files:**
- Create: `scripts/init-secrets.sh`

**Behavior:**
- Creates `secrets/docker/*.env` and `secrets/production/*.env` if missing.
- Uses blank values only.
- Does not overwrite existing files by default.
- Prints next-step reminder.

**Verification:**
- Run `bash scripts/init-secrets.sh`.
- `git status --short secrets` does not show generated `.env` files.
- Generated env files contain keys but blank values.

---

### Task 7: Validate no secret leak

**Objective:** Ensure migration did not expose values.

**Commands:**
- `git diff -- . ':!*.lock'`
- Search for likely secret literals in tracked changes.
- `git status --short`

**Checks:**
- No API keys/tokens/password values in tracked files.
- No `google-service-account.json` tracked.
- No generated `secrets/**/*.env` tracked.

---

### Task 8: Final validation

**Objective:** Prove compose and app gates still pass.

**Commands:**
- `docker compose -f docker-compose.yml config`
- `docker compose -f docker-compose.prod.yml config`
- `cd services/auth-service && npm run build`
- `cd frontends/font-end-vietsage && npm run build`
- `cd shared/api-contract && npm run verify`

**Expected:**
- Compose config passes when ignored secret env files exist.
- Backend build passes.
- Frontend build passes.
- Contract verify passes.

---

## Risks and Tradeoffs

- If `secrets/**/*.env` files are blank, containers will fail at runtime until VPS values are filled.
- Compose `env_file` does not support host interpolation for service-level env; avoid `${VAR:?}` for values moved into env files.
- Next.js public env values may be baked at build time depending on usage; production Docker build/runtime strategy must be confirmed.
- Mounting `google-service-account.json` requires file to exist on VPS; if Google sync is optional, backend should tolerate missing credentials when feature disabled.
- Removing old `.env.*.example` may affect onboarding; compensate with `secrets/README.md` and `scripts/init-secrets.sh`.

---

## Open Questions Before Execution

1. Should local Docker and production use the same `secrets/production/*` files, or keep `secrets/docker/*` for local smoke?
2. Should `node:22-alpine` remain cached for Docker builds?
3. Should `services/auth-service/.env.example` and frontend `.env.example` remain for non-Docker local dev?
4. Should Google service account be mandatory or feature-gated by `GOOGLE_SHEETS_SYNC_ENABLED=false`?

---

## Recommended Execution Ownership

- `dev-ops`: Tasks 2, 3, 4, 5, 6, 7, 8
- `backend`: Confirm backend env key inventory and Google credentials behavior
- `frontend`: Confirm NextAuth/public env runtime vs build-time behavior
- `lead`: Review final diff for secret leakage before commit

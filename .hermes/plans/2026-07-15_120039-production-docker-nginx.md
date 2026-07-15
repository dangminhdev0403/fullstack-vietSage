# VietSage Production Docker + Nginx Implementation Plan

> **For Hermes:** Implement this plan phase-by-phase only after user approval. Use strict verification at each phase and preserve unrelated changes.

**Goal:** Build and verify a production deployment stack for VietSage using Docker Compose, PostgreSQL, the NestJS auth service, the Next.js frontend, and Nginx as the only public entry point.

**Architecture:** Use multi-stage production images for Next.js and NestJS. Run `postgres`, `auth-service`, `frontend`, and `nginx` on private Compose networks; publish only Nginx ports `80/443`. Nginx proxies frontend, backend API, Auth.js routes, and Socket.IO traffic by Docker service name. Runtime secrets remain in ignored `secrets/production/**` files and are never baked into images or committed.

**Tech Stack:** Docker Engine 29, Docker Compose v5, Nginx, Node.js 22 Alpine, Next.js standalone, NestJS, Prisma 7, PostgreSQL 16 Alpine, Certbot/Let's Encrypt where public DNS is available.

---

## Current repository findings

### Already present

- `frontends/front-end-vietsage/Dockerfile`: multi-stage pnpm build, Next.js standalone runtime, non-root `node` user, health check.
- `services/auth-service/Dockerfile`: multi-stage npm build, Prisma generation, production dependency pruning, non-root `node` user, health check.
- `docker-compose.prod.yml`: PostgreSQL, backend, frontend, health-based ordering, localhost-only published app ports, read-only app filesystems, dropped capabilities.
- `deploy/nginx/vietsage.conf`: host-Nginx template for apex/www/stay domains, API, Auth.js, and Socket.IO proxying.
- `docs/DEPLOYMENT.md` and `docs/SECRETS.md`: VPS and secret-management instructions.
- Docker daemon is available: Docker `29.6.1`, Compose `v5.2.0`.

### Confirmed blockers/gaps

1. `docker-compose.prod.yml` points the frontend build context to `./frontends/font-end-vietsage`, but the actual directory is `./frontends/front-end-vietsage`.
2. `docker compose -f docker-compose.prod.yml config` currently fails because local `secrets/production/frontend.env` is absent. Real values must not be generated or guessed.
3. Current Nginx config targets host-loopback ports and is installed directly on the VPS; it is not yet a Docker Nginx service.
4. Compose does not define an explicit one-shot `prisma migrate deploy` release step.
5. Application ports are currently published to host loopback. With Nginx inside Compose, these ports should normally become internal-only.
6. TLS certificate lifecycle for containerized Nginx/Certbot is not yet defined or tested.

## Assumptions requiring confirmation

- Target is a single Linux VPS using Docker Compose, not Kubernetes.
- Nginx should run **inside Docker Compose**, rather than remain installed on the host.
- Public domains remain `vietsage.com`, `www.vietsage.com`, and `stay.vietsage.com`.
- Only Nginx exposes public ports; database, frontend, and backend remain private.
- Existing apex launch-hold behavior and `/preview` route should remain unless the user requests public launch.
- Production migrations use only `prisma migrate deploy`; never `db push`, `migrate reset`, or destructive reset commands.

---

## Phase 1 — Make the production Compose topology valid

**Objective:** Correct deterministic configuration errors and model the private/public production network boundaries.

**Files likely to change:**

- Modify: `docker-compose.prod.yml`
- Possibly create: `deploy/compose/.gitkeep` only if a supporting directory is genuinely needed
- Update: `docs/DEPLOYMENT.md`

**Steps:**

1. Add a configuration-level regression check or script that verifies:
   - frontend build context exists;
   - only Nginx publishes public ports;
   - app services have no source bind mounts;
   - production services do not run dev commands;
   - required health checks and dependency conditions are present.
2. Run the check and record the expected RED failure for the bad frontend path/current topology.
3. Fix the frontend context to `./frontends/front-end-vietsage`.
4. Define networks:
   - `edge`: Nginx ↔ frontend/backend;
   - `backend`: backend ↔ PostgreSQL, marked internal where Compose behavior supports the intended isolation.
5. Remove host-published frontend/backend ports from the final containerized-Nginx topology, or place them behind an explicitly opt-in debug profile.
6. Keep PostgreSQL unexposed.
7. Preserve app hardening: `read_only`, `/tmp` tmpfs, `no-new-privileges`, `cap_drop: [ALL]`, non-root image users, restart policies, health checks.
8. Re-run the configuration regression check and `docker compose config` using sanitized temporary env fixtures outside tracked secret paths.

**Validation:**

```bash
docker compose -f docker-compose.prod.yml --env-file <sanitized-temp-env> config --quiet
# plus the focused topology test/check
```

**Expected result:** Compose renders successfully; no application/database port is publicly published; existing production runtime hardening remains.

**Checkpoint:** Report diff and validation. Wait for approval before Phase 2.

---

## Phase 2 — Containerize Nginx routing

**Objective:** Make Nginx the Compose-managed reverse proxy and preserve current HTTP behavior.

**Files likely to change:**

- Modify or split: `deploy/nginx/vietsage.conf`
- Create: `deploy/nginx/nginx.conf` if global settings are needed
- Create: `deploy/nginx/templates/vietsage.conf.template` if runtime env substitution is used
- Modify: `docker-compose.prod.yml`
- Add focused test: e.g. `scripts/verify-production-routing.sh` or repository-appropriate test location
- Update: `docs/DEPLOYMENT.md`

**Routing contract to preserve:**

- `vietsage.com/`, `www.vietsage.com/` → launch-hold page.
- `/preview` → Next.js frontend.
- `/api/auth/*` → Next.js/Auth.js.
- `/api/*` → NestJS backend with the intended `/api` prefix-stripping behavior preserved.
- `/socket.io/*` → backend WebSocket/Socket.IO with Upgrade/Connection headers.
- `stay.vietsage.com/*` → Next.js frontend.

**Steps:**

1. Write a failing static routing test that rejects host-loopback upstreams in the Docker Nginx template and requires `frontend:3000` / `auth-service:8080`.
2. Convert upstream targets from `127.0.0.1` to Compose service DNS names.
3. Add production proxy headers consistently:
   - `Host`;
   - `X-Real-IP`;
   - `X-Forwarded-For`;
   - `X-Forwarded-Proto`;
   - WebSocket upgrade headers where needed.
4. Add safe proxy timeouts/body-size limits based on actual upload/API needs; avoid arbitrary oversized defaults.
5. Add security headers that do not conflict with Next.js/Auth.js behavior; validate before enabling strict CSP/HSTS.
6. Add Nginx service health check and dependency on healthy frontend/backend.
7. Publish only `80:80` at this phase; defer `443` until certificate files and bootstrap are defined.
8. Run `nginx -t` inside the exact Nginx image/container and execute HTTP routing smoke tests using local `Host` headers.

**Validation:**

```bash
docker compose -f docker-compose.prod.yml build nginx frontend auth-service
docker compose -f docker-compose.prod.yml up -d postgres auth-service frontend nginx

docker compose -f docker-compose.prod.yml exec nginx nginx -t
curl -fsSI -H 'Host: vietsage.com' http://127.0.0.1/
curl -fsSI -H 'Host: vietsage.com' http://127.0.0.1/preview
curl -fsS  -H 'Host: vietsage.com' http://127.0.0.1/api/health
curl -fsSI -H 'Host: stay.vietsage.com' http://127.0.0.1/
```

Also verify Socket.IO upgrade behavior from outside Nginx rather than relying only on static config inspection.

**Expected result:** Nginx is healthy and routes all four paths by service DNS; frontend/backend remain unreachable through host ports.

**Checkpoint:** Report runtime evidence and logs. Wait for approval before Phase 3.

---

## Phase 3 — Add safe production migration/release flow

**Objective:** Ensure schema migrations are deliberate, observable, and never hidden inside every backend restart.

**Files likely to change:**

- Modify: `docker-compose.prod.yml`
- Possibly create: `scripts/deploy-production.sh`
- Update: `docs/DEPLOYMENT.md`
- Update: `docs/SECRETS.md` only if runtime secret wiring changes

**Steps:**

1. Add a one-shot `migrate` Compose service/profile using the built auth image and production `DATABASE_URL`.
2. Command must be exactly the non-destructive production path, e.g. `npx prisma migrate deploy` or a verified runtime equivalent available in the image.
3. Verify the production image still contains what Prisma migration needs after `npm prune --omit=dev`. If Prisma CLI is not present at runtime, use a dedicated migration stage/image instead of adding install-at-start behavior.
4. Define deployment order:
   - backup/check database;
   - start/verify PostgreSQL;
   - run migration once and require exit code 0;
   - start backend/frontend;
   - start/reload Nginx;
   - perform smoke tests.
5. Stop deployment on migration drift/failure. Never bypass with `prisma db push`, `migrate reset`, or database recreation.
6. Document rollback boundaries: application image rollback is allowed; database rollback requires a tested migration/backup restoration plan.

**Validation:**

```bash
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d auth-service frontend nginx
docker compose -f docker-compose.prod.yml ps
```

**Expected result:** migration exits 0 before app rollout; failure prevents deployment continuation.

**Checkpoint:** Wait for approval before TLS/public exposure.

---

## Phase 4 — HTTPS and certificate lifecycle

**Objective:** Enable valid HTTPS without baking certificates into images or the repository.

**Files likely to change:**

- Modify: `docker-compose.prod.yml`
- Modify/create: `deploy/nginx/**`
- Possibly create: `scripts/bootstrap-certificates.sh`
- Update: `docs/DEPLOYMENT.md`
- Update: `.gitignore` only if a new local certificate/runtime path requires explicit exclusion

**Recommended design:**

- Nginx container exposes `80/443`.
- Certificate and ACME challenge data use named volumes or ignored host paths.
- Certbot runs as an explicit bootstrap/renew command or narrowly scoped companion service.
- Nginx reload occurs only after successful renewal.
- No private key enters Git, build context, logs, or image layers.

**Steps:**

1. Verify DNS resolves all requested domains to the target VPS before certificate issuance.
2. Add HTTP ACME challenge location and certificate volumes.
3. Bootstrap certificates using staging first to avoid Let's Encrypt rate limits.
4. Switch to production issuance only after staging succeeds.
5. Add HTTPS server blocks and HTTP → HTTPS redirects.
6. Enable HSTS only after HTTPS works across all domains and rollback access is understood.
7. Verify renewal with a dry run and confirm Nginx reload behavior.

**Validation:**

```bash
docker compose -f docker-compose.prod.yml exec nginx nginx -t
# certbot renew --dry-run through the chosen Compose command/service
curl -fsSI https://vietsage.com
curl -fsSI https://www.vietsage.com
curl -fsSI https://stay.vietsage.com
curl -fsS  https://vietsage.com/api/health
openssl s_client -connect vietsage.com:443 -servername vietsage.com </dev/null
```

**Expected result:** valid certificate chain, expected redirects, healthy routes, and successful renewal dry run.

**Checkpoint:** Wait for approval before final hardening/release rehearsal.

---

## Phase 5 — Production hardening and full release rehearsal

**Objective:** Prove the stack is operational, constrained, observable, and recoverable.

**Files likely to change:**

- Modify: `docker-compose.prod.yml`
- Modify: `deploy/nginx/**`
- Modify: `docs/DEPLOYMENT.md`
- Possibly add a non-secret deployment verification script

**Steps:**

1. Add realistic CPU/memory/PID limits after measuring baseline startup/runtime usage.
2. Add Nginx access/error log strategy with Docker log rotation; avoid sensitive query/header logging.
3. Configure Compose logging limits for every service.
4. Verify app containers:
   - run as non-root;
   - root filesystem is read-only;
   - capabilities are dropped;
   - no package manager/build tool runs at startup;
   - only intended tmpfs paths are writable.
5. Verify database persistence with named volume and documented backup/restore command.
6. Build images with explicit release tags (commit/release tag), not mutable-only deployment identifiers.
7. Run vulnerability scanning only against approved images; store reports outside source repositories according to SecurityLab policy.
8. Perform a clean-host rehearsal:
   - create sanitized/real ignored secrets;
   - render Compose;
   - build images;
   - run migration;
   - start stack;
   - validate HTTP/HTTPS/Auth.js/API/Socket.IO;
   - restart services and verify recovery;
   - roll back app image once and verify service restoration.

**Final verification matrix:**

| Gate | Required evidence |
|---|---|
| Compose syntax | `docker compose ... config --quiet` exits 0 |
| Image builds | frontend, backend, nginx build successfully |
| Database | healthy; persistence survives restart |
| Migration | one-shot job exits 0 |
| Backend | `/health` succeeds through Nginx |
| Frontend | static asset and representative public/dashboard routes succeed |
| Auth.js | `/api/auth/session` responds without `UntrustedHost`, secret, or decryption errors |
| Realtime | Socket.IO handshake/upgrade succeeds through Nginx |
| Isolation | only Nginx publishes `80/443`; app/database are internal |
| Security | non-root, read-only FS, dropped caps, no-new-privileges verified with `docker inspect` |
| TLS | valid chain and renewal dry run succeed |
| Recovery | restart and application-image rollback rehearsal succeeds |
| Repository | `git diff --check`, no secrets staged, docs match runtime |

---

## Files expected to change overall

- `docker-compose.prod.yml`
- `deploy/nginx/vietsage.conf` and/or new templated Nginx files under `deploy/nginx/`
- `docs/DEPLOYMENT.md`
- Possibly `docs/SECRETS.md`
- Possibly one deployment/bootstrap script under `scripts/`
- Focused Docker/Nginx topology and routing checks in the repository's appropriate script/test location

The application `package.json` and lockfiles should not need changes. Any package/lockfile change requires separate explicit approval.

## Risks and mitigations

1. **Current path typo blocks frontend image build** — fix first and cover with topology validation.
2. **Missing production env files block Compose rendering** — use user-supplied ignored secrets for real deployment and sanitized temporary fixtures for configuration tests; never invent production credentials.
3. **Next.js public env values are build-time sensitive** — inventory which `NEXT_PUBLIC_*` variables must be passed as build arguments versus runtime env before final image build.
4. **Auth.js host/secret mismatch** — set matching `AUTH_SECRET`/`NEXTAUTH_SECRET`, `AUTH_TRUST_HOST=true`, and verify `/api/auth/session` plus logs.
5. **Prisma CLI removed during prune** — prove migration command exists; otherwise create a dedicated migration image/stage.
6. **WebSocket proxy regression** — test a real Socket.IO handshake through Nginx.
7. **Premature HSTS/certificate lockout** — stage TLS first and enable HSTS only after all domains validate.
8. **Database migration rollback risk** — require backup and forward-compatible migrations; do not pretend image rollback reverses schema changes.
9. **Apex launch-hold behavior may be stale product intent** — preserve it by default and require explicit approval to expose the landing page publicly.
10. **Host-Nginx to Docker-Nginx migration can conflict on ports 80/443** — stop/disable host Nginx only at the approved cutover checkpoint after container routing is validated on alternate/local ports.

## Out of scope unless separately approved

- Kubernetes, Swarm, or cloud-managed orchestration.
- CI/CD pipeline or automatic remote deployment.
- Database reset, `db push`, destructive migration repair, or production data changes.
- Changing application behavior, API contracts, UI, packages, lockfiles, or ports unrelated to the deployment topology.
- Committing/pushing/deploying to the VPS.

## Approval sequence

- [ ] Approve assumptions and Phase 1.
- [ ] Approve Phase 2 after Compose topology is green.
- [ ] Approve Phase 3 after Nginx HTTP routing is green.
- [ ] Approve Phase 4 only when DNS/VPS access and certificate scope are ready.
- [ ] Approve Phase 5 for hardening and release rehearsal.
- [ ] Separate approval required for commit, push, or actual VPS deployment.

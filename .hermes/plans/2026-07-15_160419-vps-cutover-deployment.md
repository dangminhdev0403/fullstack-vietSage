# VietSage VPS Cutover and Deployment Plan

> **For Hermes:** Execute this plan gate-by-gate only after the user separately approves deployment and supplies SSH access. Never continue past a failed gate. Preserve the current host-Nginx deployment as the immediate rollback path until Docker Nginx has completed an observation period.

**Goal:** Deploy commit `9872a073c195b50f892e1d8c0132b1160d61392d` to the VPS at `72.62.69.172`, move production traffic from host Nginx to the Docker Compose stack, preserve production data and certificate continuity, and prove rollback before retiring the legacy path.

**Architecture:** Use a two-stage bridge cutover. First, run the Docker application stack behind Docker Nginx on loopback port `18080` while the existing host Nginx continues terminating public TLS. After application, database, Auth.js, and realtime verification passes, obtain a Docker-managed webroot certificate without replacing the live host certificate, test Docker HTTPS on loopback `18443`, then transfer ports `80/443` from host Nginx to Docker Nginx. This limits public interruption to the final listener handoff and keeps host Nginx available for rapid rollback.

**Tech Stack:** Ubuntu VPS, Docker Engine/Compose, PostgreSQL 16, NestJS/Prisma 7, Next.js, unprivileged Nginx 1.28, Certbot 5.1, Let's Encrypt, systemd, UFW.

---

## Known Current State

- Git branch: `master`.
- Approved release commit: `9872a073c195b50f892e1d8c0132b1160d61392d`.
- Remote: `https://github.com/dangminhdev0403/fullstack-vietSage.git`.
- DNS for `vietsage.com`, `www.vietsage.com`, and `stay.vietsage.com` resolves to `72.62.69.172`.
- Public traffic currently uses host Nginx `1.24.0 (Ubuntu)`.
- HTTP currently redirects to HTTPS.
- The public certificate currently covers all three domains and was observed valid from 2026-07-04 through 2026-10-02.
- The repository production stack passed local topology, Nginx, migration, TLS, hardening, backup, restore, restart, cold-start, and image-rollback rehearsals.
- VPS database location, current application process manager, current host Nginx config, certificate renewal authenticator, disk capacity, and Docker availability are not yet verified.

## Required Inputs Before Execution

Do not begin remote execution until these are available:

1. SSH destination and authentication method, preferably a sudo-capable non-root user.
2. Approved maintenance window and a stakeholder who can validate login/dashboard/guest workflows.
3. Real production secret values already present on the VPS or a secure channel for provisioning them. Never transmit them in chat, Git, command history, or logs.
4. Confirmed backup destination with enough capacity and preferably an off-host copy target.
5. Decision on database path after inventory:
   - adopt an existing compatible Compose PostgreSQL volume;
   - migrate the current host/container PostgreSQL into the new Compose volume during the maintenance window; or
   - explicitly redesign Compose to retain an external database. Do not guess.
6. Certbot account email.
7. Rollback owner and maximum acceptable downtime.

## Non-Negotiable Safety Rules

- Never run `prisma db push`, `prisma migrate reset`, `dropdb`, `DROP DATABASE`, or volume-destructive cleanup against production.
- Never run `docker compose down -v` on the VPS.
- Never overwrite or delete `/etc/letsencrypt` during cutover.
- Do not stop host Nginx until Docker HTTP and Docker HTTPS have both passed loopback smoke tests.
- Do not enable HSTS during this cutover.
- Do not expose temporary ports `18080/18443` publicly; bind them to `127.0.0.1` and verify UFW/provider firewall state.
- Image rollback does not reverse schema migrations. Every migration must be reviewed for backward compatibility before deployment.
- Every phase has an explicit GO/NO-GO gate. On NO-GO, stop and preserve evidence.

---

## Phase 0 — Read-Only VPS Discovery

**Objective:** Build a factual inventory without changing the server.

### 0.1 Capture system and capacity

Run remotely:

```bash
set -euo pipefail
hostname
id
uname -a
cat /etc/os-release
df -hT
df -ih
free -h
nproc
uptime
sudo ufw status verbose || true
sudo ss -lntup
```

Record free disk, RAM, listening processes on `80`, `443`, `3000`, `8080`, `5432`, and whether swap exists. Required capacity: enough for source checkout, two application image generations, PostgreSQL backup, Docker volume, and at least 20% free disk after deployment.

### 0.2 Inventory Docker and current application runtime

```bash
command -v docker || true
docker version || true
docker compose version || true
docker info || true
docker ps -a --no-trunc || true
docker volume ls || true
docker network ls || true
systemctl --type=service --state=running | grep -Ei 'nginx|postgres|node|pm2|docker' || true
pm2 list || true
ps auxww | grep -Ei '[n]ode|[p]ostgres|[n]ginx'
```

Do not install or restart anything in this phase.

### 0.3 Inventory host Nginx and certificate lifecycle

```bash
sudo nginx -T > /tmp/vietsage-nginx-before.txt
sudo nginx -t
sudo systemctl status nginx --no-pager
sudo certbot certificates || true
sudo systemctl list-timers --all | grep -Ei 'certbot|letsencrypt' || true
sudo grep -RHE '^(authenticator|installer|webroot_path|server)\s*=' /etc/letsencrypt/renewal 2>/dev/null || true
sudo find /etc/letsencrypt -maxdepth 3 -type f -printf '%p %s bytes\n' | sort
```

Copy `/tmp/vietsage-nginx-before.txt` into the private deployment evidence directory, not into Git.

### 0.4 Inventory production database without exposing credentials

Identify the process/container, PostgreSQL version, database name, size, active connections, extensions, and write rate. Use credentials already configured on the VPS; do not print connection strings.

Representative queries:

```sql
SELECT version();
SELECT current_database(), pg_size_pretty(pg_database_size(current_database()));
SELECT extname, extversion FROM pg_extension ORDER BY extname;
SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();
SELECT now(), count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL;
```

Also identify whether the current database is:

- host PostgreSQL;
- a Docker container/volume;
- an external managed database.

### Gate 0 — Inventory GO/NO-GO

GO only when:

- SSH/sudo access works;
- Docker/Compose compatibility is known;
- current runtime and DB ownership are known;
- Nginx config and renewal method are backed up;
- disk/RAM are sufficient;
- no unknown process owns the planned temporary ports.

NO-GO if the database path or backup credentials remain unknown.

---

## Phase 1 — Prepare Release and Rollback Assets

**Objective:** Prepare everything without changing public traffic.

### 1.1 Create a timestamped private release directory

Recommended structure outside the repository:

```text
/opt/vietsage/
  releases/9872a073/
  current -> releases/9872a073/
  shared/secrets/production/
  shared/backups/
  shared/evidence/<timestamp>/
```

Keep production secrets in `/opt/vietsage/shared/secrets/production` with owner-only permissions. Either symlink the repository `secrets/production` path to this directory or use a deployment-specific bind strategy. Verify the paths remain Git-ignored.

### 1.2 Check out the exact approved commit

```bash
git clone https://github.com/dangminhdev0403/fullstack-vietSage.git /opt/vietsage/releases/9872a073
cd /opt/vietsage/releases/9872a073
git checkout --detach 9872a073c195b50f892e1d8c0132b1160d61392d
test "$(git rev-parse HEAD)" = "9872a073c195b50f892e1d8c0132b1160d61392d"
git status --short
```

Expected: detached approved commit and clean worktree.

### 1.3 Provision secrets securely

Required files:

```text
secrets/production/postgres.env
secrets/production/auth-service.env
secrets/production/frontend.env
```

Set directory mode `700`, file mode `600`, and ownership to the deployment user. Validate key presence without printing values. Confirm:

- frontend public URLs use `https://vietsage.com`/`https://stay.vietsage.com` as intended;
- `AUTH_SECRET` and `NEXTAUTH_SECRET` are correct and stable;
- backend CORS includes the production origins;
- `DATABASE_URL` points to the database selected at Gate 0;
- optional Google/Telegram secret files and paths are wired only if currently used.

### 1.4 Run repository validation

```bash
python scripts/verify-production-topology.py
python scripts/verify-production-nginx.py
python scripts/verify-production-migration.py
python scripts/verify-production-tls.py
python scripts/verify-production-hardening.py
python scripts/verify-production-backup.py
bash -n scripts/*.sh
docker compose -f docker-compose.prod.yml --profile tls-tools config --quiet
```

### 1.5 Prepare immutable local release tags

Use a release ID rather than mutable-only tags:

```bash
export RELEASE_ID=9872a073
export AUTH_SERVICE_IMAGE=vietsage-auth-service:$RELEASE_ID
export FRONTEND_IMAGE=vietsage-frontend:$RELEASE_ID
docker compose -f docker-compose.prod.yml build auth-service frontend
docker image inspect "$AUTH_SERVICE_IMAGE" "$FRONTEND_IMAGE"
```

Before replacing any existing Docker application image, tag the currently running image IDs as `pre-cutover-<timestamp>` and record IDs in evidence.

### Gate 1 — Preparation GO/NO-GO

GO only if exact commit, secrets, static checks, Compose rendering, and image builds all pass. Public traffic must still be served by host Nginx.

---

## Phase 2 — Production Database Backup and Migration Decision

**Objective:** Produce a verified recovery point and select the exact database transition path.

### 2.1 Create and verify backup

For a database already represented by the production Compose `postgres` service, use:

```bash
BACKUP_DIR=/opt/vietsage/shared/backups bash scripts/backup-production-postgres.sh
sha256sum -c /opt/vietsage/shared/backups/<backup>.dump.sha256
```

For host/external PostgreSQL, use the equivalent `pg_dump --format=custom --no-owner --no-privileges` against the actual source. Store checksum, PostgreSQL version, DB size, and migration count. Copy the backup and checksum off-host before schema migration.

### 2.2 Rehearse restore before touching production schema

Restore into a new disposable database, never the live DB:

```bash
bash scripts/restore-production-postgres.sh /opt/vietsage/shared/backups/<backup>.dump vietsage_restore_<timestamp>
```

Compare:

- expected table count;
- `_prisma_migrations` count;
- representative business row counts;
- critical extensions;
- marker/query checks agreed with the application owner.

### 2.3 Select one database path

#### Path A — Existing Compose volume is the live DB

Use the existing volume. Confirm its Compose project/volume identity before running anything. Do not create a second empty volume with the same logical service name.

#### Path B — Current DB must move into the new Compose volume

Use a maintenance window:

1. Stop or place the old application in write-maintenance mode.
2. Confirm active application writes have stopped.
3. Take a final custom-format backup and checksum.
4. Start only the new PostgreSQL service.
5. Restore into the new database.
6. Compare migration and business row counts.
7. Keep the old database untouched for rollback.

Estimated downtime depends on measured dump/restore duration from Phase 0; do not promise a fixed duration before measurement.

#### Path C — Keep an external/host database

Do not deploy the current Compose unchanged. First create and locally validate a repository change that disables the bundled PostgreSQL service for that deployment and guarantees backend network reachability to the external DB. Commit/review/push that change separately before cutover.

### 2.4 Review migrations

Run `prisma migrate status` and inspect every pending migration. Confirm forward/backward application compatibility. Then:

```bash
docker compose -f docker-compose.prod.yml run --rm migrate
```

Capture exit code and logs. Failure is an immediate NO-GO; do not bypass it.

### Gate 2 — Data GO/NO-GO

GO only with verified off-host backup, successful restore rehearsal, selected DB path, matching row/migration checks, and migration exit `0`.

---

## Phase 3 — Start Docker Stack Behind Host Nginx

**Objective:** Validate the new production stack on loopback while public TLS remains unchanged.

### 3.1 Bind Docker Nginx to loopback alternate ports

```bash
export NGINX_HTTP_PORT=127.0.0.1:18080
export NGINX_HTTPS_PORT=127.0.0.1:18443
export NGINX_CONFIG_FILE=docker-vietsage.conf
export AUTH_SERVICE_IMAGE=vietsage-auth-service:9872a073
export FRONTEND_IMAGE=vietsage-frontend:9872a073
```

Render Compose and confirm `127.0.0.1` bindings before start:

```bash
docker compose -f docker-compose.prod.yml config > /tmp/vietsage-compose-rendered.yml
grep -nE '18080|18443' /tmp/vietsage-compose-rendered.yml
```

Expected: temporary ports are loopback-only.

### 3.2 Start services in controlled order

```bash
docker compose -f docker-compose.prod.yml up -d postgres
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d auth-service frontend nginx
docker compose -f docker-compose.prod.yml ps
```

### 3.3 Loopback smoke matrix

Use `Host` headers against `127.0.0.1:18080`:

- `/nginx-health`;
- apex `/` launch-hold page;
- `/preview`;
- `/api/health`;
- `/api/auth/session`;
- `stay.vietsage.com/`;
- Socket.IO WebSocket upgrade.

Inspect logs for `UntrustedHost`, Auth.js secret/decryption errors, DB connection errors, migration errors, CORS failures, permission errors, OOM, and restart loops.

### 3.4 Add temporary host-Nginx bridge

Based on the actual `nginx -T` inventory, modify the existing host server blocks so application routes proxy to `http://127.0.0.1:18080` while host Nginx continues TLS termination. Preserve `Host`, `X-Forwarded-*`, WebSocket upgrade headers, current certificate directives, and rollback copy.

Before reload:

```bash
sudo cp -a /etc/nginx /opt/vietsage/shared/evidence/<timestamp>/nginx-before-bridge
sudo nginx -t
```

Reload, do not restart:

```bash
sudo systemctl reload nginx
```

### 3.5 Public bridge validation

Validate all domains/routes externally and complete stakeholder login/dashboard/guest tests. Confirm public certificate is unchanged and host Nginx remains the TLS server.

### Gate 3 — Application GO/NO-GO

Observe for an agreed period, recommended at least 15–30 minutes for a first cutover. GO only with healthy containers, public route matrix pass, successful stakeholder checks, and no material error increase.

Rollback at this phase: restore the saved host-Nginx config and reload; stop Docker application containers without deleting volumes.

---

## Phase 4 — Provision Docker-Managed Certificate Safely

**Objective:** Obtain and test a separate certificate in the Docker `letsencrypt` volume while the host certificate remains live.

### 4.1 Bridge ACME challenge through host Nginx

Add a highest-priority host-Nginx location for all three domains:

```nginx
location ^~ /.well-known/acme-challenge/ {
    proxy_pass http://127.0.0.1:18080;
    proxy_set_header Host $host;
}
```

Test a known challenge fixture through the public domain before Certbot.

### 4.2 Use dry-run rather than saved staging certificate

Do not replace a valid live certificate with a saved staging certificate. Run Docker Certbot `certonly --webroot --dry-run` directly, or first change `scripts/bootstrap-production-certificates.sh` so its staging mode uses `--dry-run` and does not persist staging material. This repository change must be reviewed, committed, and pushed before use.

Required dry-run domains:

```text
vietsage.com
www.vietsage.com
stay.vietsage.com
```

### 4.3 Issue Docker production certificate

After dry-run passes, run production `certonly --webroot` into the named `letsencrypt` volume. Record certificate serial, SANs, issuer, and expiration. Do not modify `/etc/letsencrypt` on the host.

### 4.4 Start Docker TLS on loopback

```bash
export NGINX_CONFIG_FILE=docker-vietsage-tls.conf
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
docker compose -f docker-compose.prod.yml exec -T nginx nginx -t
```

Validate `127.0.0.1:18443` with SNI/Host for all domains, certificate chain, HTTP redirect behavior, API, Auth.js, frontend, and WSS. Confirm HSTS is absent.

### 4.5 Renewal rehearsal

```bash
bash scripts/renew-production-certificates.sh dry-run
```

Verify successful dry run and Nginx config/reload behavior.

### Gate 4 — TLS GO/NO-GO

GO only with ACME challenge, dry-run, production issuance, loopback TLS routes, SANs, chain, and renewal rehearsal all passing. Host Nginx and its certificate must still be available for rollback.

---

## Phase 5 — Final Listener Handoff

**Objective:** Move public `80/443` from host Nginx to Docker Nginx with a short, controlled interruption.

### 5.1 Pre-cutover checklist

- Announce maintenance start.
- Confirm current backup/checksum/off-host copy.
- Confirm all containers healthy.
- Confirm Docker certificate validity.
- Save `nginx -T`, host service state, Compose env exports, image IDs, and container inspect output.
- Keep an active SSH session plus a second recovery session.
- Confirm provider console/out-of-band access.
- Prepare exact rollback commands before stopping host Nginx.

### 5.2 Stop host listener and recreate Docker Nginx on public ports

```bash
sudo systemctl stop nginx
sudo ss -lntup | grep -E ':(80|443)\b' || true

export NGINX_HTTP_PORT=80
export NGINX_HTTPS_PORT=443
export NGINX_CONFIG_FILE=docker-vietsage-tls.conf
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
```

Immediately verify Docker Nginx health and listeners. If Docker Nginx is not healthy within the agreed threshold, execute rollback without debugging in the outage window.

### 5.3 Public verification matrix

From outside the VPS:

- HTTP redirects to HTTPS for all domains;
- valid SAN/chain/expiration for all domains;
- apex launch-hold behavior;
- `/preview` frontend;
- `/api/health`;
- `/api/auth/session` without host/secret/decryption errors;
- `stay.vietsage.com`;
- Socket.IO WSS upgrade;
- representative authenticated dashboard workflow;
- representative guest workflow;
- no app/DB host ports exposed;
- Docker Nginx is the only public `80/443` owner.

### Gate 5 — Cutover GO/NO-GO

GO when every route and workflow passes and logs remain clean. Keep host Nginx installed but disabled during observation.

---

## Immediate Rollback Procedure

Use this if final handoff fails before any irreversible database change beyond approved migrations:

```bash
# Move Docker ingress off public ports without deleting app/data volumes.
export NGINX_HTTP_PORT=127.0.0.1:18080
export NGINX_HTTPS_PORT=127.0.0.1:18443
export NGINX_CONFIG_FILE=docker-vietsage-tls.conf
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx

# Restore the exact saved host-Nginx configuration if changed.
sudo rsync -a --delete /opt/vietsage/shared/evidence/<timestamp>/nginx-before-cutover/ /etc/nginx/
sudo nginx -t
sudo systemctl start nginx
```

Then verify public HTTPS and record incident evidence. Do not remove Docker volumes or restore the database during an immediate ingress rollback.

If application-image rollback is required, set `AUTH_SERVICE_IMAGE` and `FRONTEND_IMAGE` to recorded pre-cutover tags and recreate `migrate`, `auth-service`, `frontend`, and `nginx`. Proceed only if the older images are compatible with the migrated schema.

Database restoration is a separate incident decision requiring explicit approval, maintenance mode, and demonstrated data-loss window. Never use it as an automatic rollback step.

---

## Phase 6 — Observation and Post-Cutover Operations

**Objective:** Stabilize before retiring legacy assets.

### 6.1 Observation

Recommended minimum first-cutover observation: 24 hours. Monitor:

- container health/restarts/OOM;
- CPU/RAM/PIDs;
- Nginx 4xx/5xx and upstream errors;
- backend errors and DB pool health;
- Auth.js errors;
- realtime disconnects;
- disk usage and Docker log rotation;
- PostgreSQL connections/storage growth.

### 6.2 Schedule renewal

Only after `renew --dry-run` succeeds under the final public topology, install a systemd timer or root cron entry for:

```bash
cd /opt/vietsage/current && bash scripts/renew-production-certificates.sh renew
```

Use locking to prevent overlapping runs and send failures to the operator. Re-run public TLS checks after the first scheduled renewal cycle.

### 6.3 Backup schedule

Schedule custom-format PostgreSQL backups with checksum, retention, encryption/off-host transfer, and alerting. Periodically restore a backup into a new rehearsal database and verify representative data.

### 6.4 Retire legacy path only after acceptance

After the observation period and explicit approval:

- disable host Nginx at boot, but keep configs/evidence archived;
- retain old application artifacts and old DB according to rollback retention policy;
- do not delete the host certificate until Docker renewal is proven;
- update deployment evidence and operational ownership;
- optionally enable HSTS only in a separate reviewed change.

---

## Required Evidence Bundle

Save outside Git under `/opt/vietsage/shared/evidence/<timestamp>/`:

- system/capacity inventory;
- before/after listeners;
- `nginx -T` before bridge and before/after cutover;
- certificate details before/after;
- exact release commit and image IDs/tags;
- rendered Compose with secret values redacted;
- backup path/checksum and off-host confirmation;
- restore rehearsal results;
- migration logs/exit code;
- container health/inspect summaries;
- HTTP/HTTPS/Auth.js/API/WSS smoke results;
- stakeholder acceptance;
- rollback commands and whether exercised.

## Files Likely to Change Before Execution

Only if required by discovery:

- Modify: `scripts/bootstrap-production-certificates.sh` — make pre-production validation use `certonly --dry-run` rather than persisting staging certificates.
- Update: `scripts/verify-production-tls.py` — enforce dry-run bootstrap behavior.
- Update: `docs/DEPLOYMENT.md` — add the host-Nginx bridge and listener handoff runbook after actual VPS layout is known.
- Possibly create: `deploy/nginx/host-bridge-vietsage.conf` — only after capturing the actual host config; do not guess it locally.
- Possibly create: a Compose override for an external database, but only if Gate 0 selects Path C.

Any repository change requires local validation, review, commit, and push before remote deployment.

## Final Acceptance Criteria

- Exact approved commit deployed.
- Verified backup exists off-host and restore rehearsal passed.
- Production migration exited `0` without destructive commands.
- Only Docker Nginx owns public `80/443`.
- Database, backend, and frontend have no public host ports.
- All containers healthy, constrained, and free of restart/OOM loops.
- HTTP/HTTPS/frontend/API/Auth.js/WSS workflows pass externally.
- Docker-managed certificate covers all domains and renewal dry-run passes.
- Immediate host-Nginx rollback remains available through the observation window.
- No secrets entered Git, logs, chat, or image layers.
- Evidence bundle and operator handoff are complete.

## Approval Boundaries

This plan does not authorize SSH access, server mutation, package installation, database backup/migration, certificate issuance, service restart, firewall changes, or traffic cutover. Obtain explicit execution approval after Gate 0 inputs are supplied. Require an additional confirmation immediately before Phase 5 listener handoff.

# VietSage VPS deployment

This repo ships a production Docker Compose stack with Nginx as the only public ingress:

- `vietsage.com/` -> temporary launch-hold page served by Nginx, so the public landing page is hidden without rebuilding the frontend
- `vietsage.com/preview` -> current landing page proxied to `frontend:3000`
- `www.vietsage.com/` -> temporary launch-hold page served by Nginx
- `www.vietsage.com/preview` -> current landing page proxied to `frontend:3000`
- `stay.vietsage.com` -> dashboard/frontend on `frontend:3000`
- `vietsage.com/api/*` -> core API on `auth-service:8080`

The current codebase contains one Next.js frontend app with dashboard routes inside it, so `stay.vietsage.com` points to the same local frontend port. If the dashboard becomes a separate process later, change the `stay.vietsage.com` `proxy_pass` in `deploy/nginx/vietsage.conf` to that dashboard port.

## 1. Pull code on the VPS

```bash
cd /path/to/vietsageWeb
git pull
```

## 2. Create production secret files

Docker is the production deployment path. Runtime secrets live under `secrets/**` and are ignored by git.

```bash
bash scripts/init-secrets.sh
```

Then edit these files directly on the VPS and fill real values:

- `secrets/production/postgres.env` — `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `secrets/production/auth-service.env` — `DATABASE_URL`, JWT secrets/TTLs, CORS, auth admin, rate limits, optional Google/Telegram values
- `secrets/production/frontend.env` — `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `AUTH_SECRET`, `AUTH_TRUST_HOST`, public frontend URLs/options

See `docs/SECRETS.md` for the full key inventory. Do not commit `secrets/**/*.env` or `secrets/**/*.json`.

For local Docker, use the same shape under `secrets/docker/*.env`:

```bash
bash scripts/init-secrets.sh
docker compose -f docker-compose.yml config
docker compose -f docker-compose.yml up -d --build
```

## 3. Build, migrate, and start Docker services

```bash
docker compose -f docker-compose.prod.yml config
python scripts/verify-production-migration.py
docker compose -f docker-compose.prod.yml build auth-service frontend
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d
```

The one-shot `migrate` service runs `prisma migrate deploy` from the production auth-service image after PostgreSQL becomes healthy. `auth-service` uses `condition: service_completed_successfully`, so a failed migration prevents backend rollout. Never replace this step with `prisma db push`, `prisma migrate reset`, or database recreation. Review migration failures and stop the release instead.

`docker compose up -d --build` also respects the migration gate, but the explicit build → migrate → start sequence above keeps release logs and failure boundaries easier to inspect.

Production Compose builds stable local image tags (`vietsage-frontend:prod`, `vietsage-auth-service:prod`) instead of deploy-only `latest` tags. The frontend and auth-service containers run as the Node non-root user with `read_only`, `tmpfs`, `no-new-privileges`, `cap_drop: [ALL]`, and health checks. The frontend image uses Next.js standalone output and the existing `pnpm-lock.yaml`; no `package-lock.json` is required for the frontend Docker build.

The application services use explicit production networks. PostgreSQL is reachable only on the internal `backend` network; the auth service joins `backend` and `edge`; the frontend and Docker-managed Nginx join `edge`. Frontend, backend, and PostgreSQL do not publish host ports; Nginx is the only public ingress.

Check container health without publishing application ports:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml exec auth-service node -e "fetch('http://127.0.0.1:8080/health').then(async r=>{console.log(r.status, await r.text());process.exit(r.ok?0:1)}).catch(()=>process.exit(1))"
docker compose -f docker-compose.prod.yml exec frontend node -e "fetch('http://127.0.0.1:3000/icon.png').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
docker compose -f docker-compose.prod.yml ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'
```

Run the static production-topology regression check before deployment:

```bash
python scripts/verify-production-topology.py
```

## 4. Docker-managed Nginx (current production path)

Production Compose includes `nginxinc/nginx-unprivileged:1.28-alpine` as the only published HTTP/HTTPS service. Host ports `80/443` map to unprivileged container ports `8080/8443`. It mounts the selected Docker Nginx config, waits for healthy frontend/backend containers, and routes by Docker service DNS:

- `frontend:3000` for the frontend and Auth.js;
- `auth-service:8080` for backend API and Socket.IO;
- `postgres` remains available only to the backend network.

Run the static checks before building:

```bash
python scripts/verify-production-topology.py
python scripts/verify-production-nginx.py
```

For local HTTP smoke testing without occupying port 80:

```bash
NGINX_HTTP_PORT=18080 docker compose -f docker-compose.prod.yml up -d --build
curl -fsS -H 'Host: vietsage.com' http://127.0.0.1:18080/nginx-health
curl -fsS -H 'Host: vietsage.com' http://127.0.0.1:18080/api/health
curl -fsS -H 'Host: vietsage.com' http://127.0.0.1:18080/api/auth/session
curl -fsS -H 'Host: stay.vietsage.com' http://127.0.0.1:18080/ >/dev/null
```

On the production VPS, leave `NGINX_HTTP_PORT` unset so Nginx publishes host port 80. Frontend, backend, and PostgreSQL do not publish host ports.

## 5. Legacy host-Nginx cutover reference

Do not run host Nginx and Docker Nginx on the same `80/443` ports. The commands below are retained only as a cutover/fallback reference for installations that deliberately keep Nginx on the host instead of using the Compose service.

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx/vietsage.conf /etc/nginx/sites-available/vietsage.com
sudo ln -sf /etc/nginx/sites-available/vietsage.com /etc/nginx/sites-enabled/vietsage.com
sudo nginx -t
sudo systemctl restart nginx
```

## 6. Open firewall ports

On the VPS:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

If your provider has an external firewall/security group, also allow inbound TCP `80` and `443` there.

## 7. Issue HTTPS certificates with Docker Certbot

The Compose TLS lifecycle uses:

- `certbot_webroot` for `/.well-known/acme-challenge/`;
- `letsencrypt` for certificate/account state;
- `deploy/nginx/docker-vietsage.conf` for HTTP bootstrap;
- `deploy/nginx/docker-vietsage-tls.conf` for HTTPS runtime.

Make sure DNS points to the VPS before running Certbot:

- `vietsage.com` A -> `72.62.69.172`
- `www.vietsage.com` CNAME -> `vietsage.com`
- `stay.vietsage.com` A -> `72.62.69.172`

Also ensure no host Nginx process is occupying ports `80/443` when cutting over to Docker Nginx. The current VPS may already have host Nginx and valid certificates; stop or migrate it only in an approved maintenance window.

Validate the repository configuration:

```bash
python scripts/verify-production-tls.py
bash -n scripts/bootstrap-production-certificates.sh scripts/renew-production-certificates.sh
```

Bootstrap against Let's Encrypt staging first:

```bash
CERTBOT_EMAIL=ops@example.com \
CERTBOT_ENVIRONMENT=staging \
bash scripts/bootstrap-production-certificates.sh
```

Verify the staging certificate and all routes. Then replace it with a production certificate; production mode intentionally uses `--force-renewal` so the still-valid staging certificate cannot be retained:

```bash
CERTBOT_EMAIL=ops@example.com \
CERTBOT_ENVIRONMENT=production \
bash scripts/bootstrap-production-certificates.sh
```

Run the real renewal rehearsal after the production certificate exists:

```bash
bash scripts/renew-production-certificates.sh dry-run
```

Schedule `bash scripts/renew-production-certificates.sh renew` through the VPS scheduler only after the dry run succeeds. The renewal script validates and reloads Nginx after Certbot succeeds. HSTS remains intentionally disabled until the public Docker TLS cutover is verified and rollback access is confirmed.

## 8. Verify externally

```bash
curl -I http://vietsage.com
curl -fsSI https://vietsage.com
curl -fsSI https://www.vietsage.com
curl -fsSI https://stay.vietsage.com
curl -fsS https://vietsage.com/api/health
openssl s_client -connect vietsage.com:443 -servername vietsage.com </dev/null
```

Expected result:

- HTTP returns a redirect to HTTPS after Certbot redirect mode is enabled.
- HTTPS returns a valid certificate.
- `vietsage.com/` and `www.vietsage.com/` show the temporary launch-hold page.
- `vietsage.com/preview` and `www.vietsage.com/preview` show the current marketing landing page through the frontend app.
- `stay.vietsage.com` reaches the dashboard routes in the frontend app.

## 9. Operations, backup, and release rehearsal

Production services have explicit CPU, memory, and PID limits based on measured idle usage with safety headroom. Every service uses the Docker `json-file` driver with `10m` files and five-file retention. Verify the rendered/runtime constraints before cutover:

```bash
python scripts/verify-production-hardening.py
docker compose -f docker-compose.prod.yml config --quiet
docker inspect vietsage-auth-service vietsage-frontend vietsage-nginx
```

The application and ingress containers use read-only root filesystems, `no-new-privileges`, dropped capabilities, and non-root image users. PostgreSQL needs a writable data volume and therefore does not use a read-only root filesystem.

Create an encrypted/off-host production backup according to the VPS storage policy. The repository helper creates a PostgreSQL custom-format dump, a SHA-256 checksum, and permissions restricted by `umask 077`:

```bash
BACKUP_DIR=/secure/off-host/staging bash scripts/backup-production-postgres.sh
sha256sum -c /secure/off-host/staging/<backup>.dump.sha256
```

Rehearse restore only into a new database name:

```bash
bash scripts/restore-production-postgres.sh /secure/off-host/staging/<backup>.dump vietsage_restore_rehearsal
```

The restore helper refuses the live source database and any target database that already exists. It never drops a database. Image rollback does not roll back schema migrations; restore production data only through a separately approved incident procedure.

Use immutable application image references for a release:

```bash
export AUTH_SERVICE_IMAGE=registry.example/vietsage-auth-service:<release-id>
export FRONTEND_IMAGE=registry.example/vietsage-frontend:<release-id>
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml run --rm migrate
docker compose -f docker-compose.prod.yml up -d --no-build auth-service frontend nginx
```

For application rollback, set both variables to the previously verified tags and recreate `migrate`, `auth-service`, `frontend`, and `nginx`. The migration gate still runs; do not assume an older application image can reverse a newer database schema.

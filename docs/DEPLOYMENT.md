# VietSage VPS deployment

This repo ships a production Docker Compose file and an Nginx reverse proxy template for:

- `vietsage.com` -> frontend on `127.0.0.1:3000`
- `www.vietsage.com` -> frontend on `127.0.0.1:3000`
- `stay.vietsage.com` -> dashboard/frontend on `127.0.0.1:3000`
- `vietsage.com/api/*` -> auth service on `127.0.0.1:8080`

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
- `secrets/production/frontend.env` — `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, public frontend URLs/options

See `docs/SECRETS.md` for the full key inventory. Do not commit `secrets/**/*.env` or `secrets/**/*.json`.

For local Docker, use the same shape under `secrets/docker/*.env`:

```bash
bash scripts/init-secrets.sh
docker compose -f docker-compose.yml config
docker compose -f docker-compose.yml up -d --build
```

## 3. Start Docker services

```bash
docker compose -f docker-compose.prod.yml config
docker compose -f docker-compose.prod.yml up -d --build
```

Check status:

```bash
docker compose -f docker-compose.prod.yml ps
curl -fsS http://127.0.0.1:3000 >/dev/null
curl -fsS http://127.0.0.1:8080/health
docker compose -f docker-compose.prod.yml ps --format 'table {{.Name}}\t{{.Status}}\t{{.Ports}}'
```

## 4. Install and configure Nginx

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx/vietsage.conf /etc/nginx/sites-available/vietsage.com
sudo ln -sf /etc/nginx/sites-available/vietsage.com /etc/nginx/sites-enabled/vietsage.com
sudo nginx -t
sudo systemctl restart nginx
```

## 5. Open firewall ports

On the VPS:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

If your provider has an external firewall/security group, also allow inbound TCP `80` and `443` there.

## 6. Issue HTTPS certificates

Make sure DNS points to the VPS before running Certbot:

- `vietsage.com` A -> `72.62.69.172`
- `www.vietsage.com` CNAME -> `vietsage.com`
- `stay.vietsage.com` A -> `72.62.69.172`

Then run:

```bash
sudo certbot --nginx -d vietsage.com -d www.vietsage.com -d stay.vietsage.com
sudo nginx -t
sudo systemctl reload nginx
```

Choose the Certbot redirect option to force HTTP -> HTTPS.

## 7. Verify externally

```bash
curl -I http://vietsage.com
curl -fsSI https://vietsage.com
curl -fsSI https://www.vietsage.com
curl -fsSI https://stay.vietsage.com
curl -fsS https://vietsage.com/api/health
openssl s_client -connect vietsage.com:443 -servername vietsage.com </dev/null
```

Expected result:

- HTTP returns a redirect to HTTPS.
- HTTPS returns a valid certificate.
- `vietsage.com` and `www.vietsage.com` show the marketing/frontend app.
- `stay.vietsage.com` reaches the dashboard routes in the frontend app.

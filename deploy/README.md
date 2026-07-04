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

## 2. Create production env files

Root Compose env:

```bash
cp .env.docker.example .env.production
```

Edit `.env.production` and set real values:

```env
POSTGRES_DB=vietsage_auth
POSTGRES_USER=postgres
POSTGRES_PASSWORD=replace-with-a-strong-password
FRONTEND_PORT=3000
AUTH_SERVICE_PORT=8080
NEXTAUTH_URL=https://vietsage.com
NEXT_PUBLIC_AUTH_API_BASE_URL=https://vietsage.com/api
```

Frontend env:

```bash
cp frontends/font-end-vietsage/.env.docker.example frontends/font-end-vietsage/.env.docker
```

Set production-safe values in `frontends/font-end-vietsage/.env.docker`:

```env
AUTH_API_BASE_URL=http://auth-service:8080
NEXT_PUBLIC_AUTH_API_BASE_URL=https://vietsage.com/api
NEXTAUTH_URL=https://vietsage.com
NEXTAUTH_SECRET=replace-with-a-long-random-secret
AUTH_SECRET=replace-with-a-long-random-secret
AUTH_TRUST_HOST=true
```

Auth service env:

```bash
cp services/auth-service/.env.docker.example services/auth-service/.env.docker
```

Review `services/auth-service/.env.docker` and make sure database credentials match `.env.production`.

## 3. Start Docker services

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
```

Check status:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
curl -I http://127.0.0.1:3000
curl -I http://127.0.0.1:8080
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
curl -I https://vietsage.com
curl -I https://www.vietsage.com
curl -I https://stay.vietsage.com
openssl s_client -connect vietsage.com:443 -servername vietsage.com </dev/null
```

Expected result:

- HTTP returns a redirect to HTTPS.
- HTTPS returns a valid certificate.
- `vietsage.com` and `www.vietsage.com` show the marketing/frontend app.
- `stay.vietsage.com` reaches the dashboard routes in the frontend app.

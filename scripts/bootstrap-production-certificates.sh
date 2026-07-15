#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

CERTBOT_EMAIL="${CERTBOT_EMAIL:?Set CERTBOT_EMAIL to the ACME account email}"
CERTBOT_ENVIRONMENT="${CERTBOT_ENVIRONMENT:-staging}"
DOMAINS=(vietsage.com www.vietsage.com stay.vietsage.com)

case "$CERTBOT_ENVIRONMENT" in
  staging)
    SERVER_ARGS=(--staging)
    ;;
  production)
    # Replace the staging certificate even when it is not near expiry.
    SERVER_ARGS=(--force-renewal)
    ;;
  *)
    printf 'CERTBOT_ENVIRONMENT must be staging or production\n' >&2
    exit 2
    ;;
esac

# Bootstrap mode must stay on the HTTP config until certificates exist.
export NGINX_CONFIG_FILE=docker-vietsage.conf
docker compose -f docker-compose.prod.yml up -d postgres migrate auth-service frontend nginx

for domain in "${DOMAINS[@]}"; do
  if ! getent ahostsv4 "$domain" >/dev/null; then
    printf 'DNS lookup failed for %s\n' "$domain" >&2
    exit 1
  fi
  printf 'DNS lookup succeeded for %s\n' "$domain"
done

domain_args=(
  -d vietsage.com
  -d www.vietsage.com
  -d stay.vietsage.com
)

docker compose -f docker-compose.prod.yml --profile tls-tools run --rm certbot \
  certonly --webroot -w /var/www/certbot \
  --email "$CERTBOT_EMAIL" --agree-tos --no-eff-email \
  --cert-name vietsage.com --keep-until-expiring \
  "${SERVER_ARGS[@]}" "${domain_args[@]}"

export NGINX_CONFIG_FILE=docker-vietsage-tls.conf
docker compose -f docker-compose.prod.yml up -d --force-recreate nginx
docker compose -f docker-compose.prod.yml exec -T nginx nginx -t
docker compose -f docker-compose.prod.yml exec -T nginx nginx -s reload

printf 'Certificate bootstrap completed in %s mode. Verify HTTPS externally before enabling HSTS.\n' "$CERTBOT_ENVIRONMENT"

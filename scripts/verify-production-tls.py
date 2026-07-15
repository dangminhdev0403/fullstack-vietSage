#!/usr/bin/env python3
"""Static regression checks for Docker Nginx TLS and Certbot lifecycle."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ROOT / "docker-compose.prod.yml"
HTTPS_CONFIG = ROOT / "deploy/nginx/docker-vietsage-tls.conf"
BOOTSTRAP_CONFIG = ROOT / "deploy/nginx/docker-vietsage.conf"
BOOTSTRAP_SCRIPT = ROOT / "scripts/bootstrap-production-certificates.sh"
RENEW_SCRIPT = ROOT / "scripts/renew-production-certificates.sh"


def service_block(compose: str, service: str) -> str:
    match = re.search(
        rf"(?ms)^  {re.escape(service)}:\n(?P<body>.*?)(?=^  [a-zA-Z0-9_-]+:\n|^volumes:\n|^networks:\n|\Z)",
        compose,
    )
    if not match:
        raise AssertionError(f"missing service: {service}")
    return match.group("body")


def main() -> int:
    compose = COMPOSE.read_text(encoding="utf-8")
    failures: list[str] = []

    try:
        nginx = service_block(compose, "nginx")
    except AssertionError as error:
        failures.append(str(error))
        nginx = ""

    for required in (
        '${NGINX_HTTPS_PORT:-443}:8443',
        "certbot_webroot:/var/www/certbot:ro",
        "letsencrypt:/etc/letsencrypt:ro",
    ):
        if required not in nginx:
            failures.append(f"nginx service is missing TLS wiring: {required}")

    try:
        certbot = service_block(compose, "certbot")
    except AssertionError as error:
        failures.append(str(error))
        certbot = ""

    for required in (
        "certbot/certbot:",
        "certbot_webroot:/var/www/certbot",
        "letsencrypt:/etc/letsencrypt",
        "restart: \"no\"",
    ):
        if required not in certbot:
            failures.append(f"certbot service is missing: {required}")

    for volume in ("certbot_webroot:", "letsencrypt:"):
        if volume not in compose:
            failures.append(f"production Compose is missing volume: {volume}")

    if not BOOTSTRAP_CONFIG.is_file():
        failures.append("missing HTTP bootstrap Nginx config")
    else:
        bootstrap = BOOTSTRAP_CONFIG.read_text(encoding="utf-8")
        if "location ^~ /.well-known/acme-challenge/" not in bootstrap:
            failures.append("HTTP bootstrap config is missing ACME challenge route")
        if "root /var/www/certbot" not in bootstrap:
            failures.append("HTTP bootstrap config is missing Certbot webroot")

    if not HTTPS_CONFIG.is_file():
        failures.append("missing HTTPS Nginx config")
    else:
        tls = HTTPS_CONFIG.read_text(encoding="utf-8")
        required_tls = (
            "listen 8443 ssl",
            "ssl_certificate /etc/letsencrypt/live/vietsage.com/fullchain.pem",
            "ssl_certificate_key /etc/letsencrypt/live/vietsage.com/privkey.pem",
            "return 301 https://$host$request_uri",
            "location ^~ /.well-known/acme-challenge/",
            "proxy_set_header X-Forwarded-Proto https",
            "location /socket.io/",
        )
        for required in required_tls:
            if required not in tls:
                failures.append(f"HTTPS Nginx config is missing: {required}")
        if "Strict-Transport-Security" in tls:
            failures.append("HSTS must remain disabled until public TLS cutover is verified")
        if re.search(r"ssl_protocols[^;]*(TLSv1(?:\.0|\.1)?)(?:\s|;)", tls):
            failures.append("HTTPS config enables obsolete TLS protocol")

    for script, label in ((BOOTSTRAP_SCRIPT, "bootstrap"), (RENEW_SCRIPT, "renewal")):
        if not script.is_file():
            failures.append(f"missing certificate {label} script: {script.relative_to(ROOT)}")

    if BOOTSTRAP_SCRIPT.is_file():
        text = BOOTSTRAP_SCRIPT.read_text(encoding="utf-8")
        for required in ("--staging", "--force-renewal", "certonly", "--webroot", "nginx -t"):
            if required not in text:
                failures.append(f"bootstrap script is missing: {required}")

    if RENEW_SCRIPT.is_file():
        text = RENEW_SCRIPT.read_text(encoding="utf-8")
        for required in ("renew", "--dry-run", "nginx -s reload"):
            if required not in text:
                failures.append(f"renewal script is missing: {required}")

    if failures:
        print("Production TLS verification FAILED:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("Production TLS verification passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

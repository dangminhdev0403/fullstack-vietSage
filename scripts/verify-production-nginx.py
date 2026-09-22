#!/usr/bin/env python3
"""Static regression checks for Docker-managed production Nginx routing."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE_PATH = ROOT / "docker-compose.prod.yml"
NGINX_PATH = ROOT / "deploy/nginx/docker-vietsage.conf"
TLS_NGINX_PATH = ROOT / "deploy/nginx/docker-vietsage-tls.conf"
HOST_NGINX_PATH = ROOT / "deploy/nginx/vietsage.conf"

RATE_LIMIT_GLOBALS = (
    "set_real_ip_from 172.16.0.0/12;",
    "real_ip_header X-Forwarded-For;",
    "real_ip_recursive on;",
    "limit_req_zone $binary_remote_addr zone=auth_rate:5m rate=10r/s;",
    "limit_req_zone $binary_remote_addr zone=api_rate:5m rate=60r/s;",
    "limit_req_zone $binary_remote_addr zone=upload_rate:5m rate=4r/s;",
    "limit_conn_zone $binary_remote_addr zone=per_ip_conn:5m;",
    "limit_conn_zone $server_name zone=global_conn:1m;",
    "limit_req_status 429;",
    "limit_conn_status 429;",
    "proxy_hide_header X-Powered-By;",
)

RATE_LIMITED_LOCATIONS = {
    "location /api/auth/ {": "limit_req zone=auth_rate burst=20 nodelay;",
    "location = /api/health {": "limit_req zone=api_rate burst=120 nodelay;",
    "location ^~ /api/cccd-mobile/ {": "limit_req zone=upload_rate burst=8 nodelay;",
    "location /api/ {": "limit_req zone=api_rate burst=120 nodelay;",
}


def fail(message: str, failures: list[str]) -> None:
    failures.append(message)


def location_blocks(config: str, signature: str) -> list[str]:
    blocks: list[str] = []
    offset = 0
    while True:
        start = config.find(signature, offset)
        if start < 0:
            return blocks
        depth = 0
        for index in range(start, len(config)):
            if config[index] == "{":
                depth += 1
            elif config[index] == "}":
                depth -= 1
                if depth == 0:
                    blocks.append(config[start : index + 1])
                    offset = index + 1
                    break
        else:
            return blocks


def verify_rate_limits(label: str, config: str, failures: list[str]) -> None:
    for directive in RATE_LIMIT_GLOBALS:
        if directive not in config:
            fail(f"{label} is missing rate-limit directive: {directive}", failures)
    for signature, rate_directive in RATE_LIMITED_LOCATIONS.items():
        blocks = location_blocks(config, signature)
        if len(blocks) != 2:
            fail(f"{label} must define {signature} for both public hosts", failures)
            continue
        for block in blocks:
            if rate_directive not in block:
                fail(f"{label} {signature} is missing: {rate_directive}", failures)
            if "limit_conn per_ip_conn 80;" not in block:
                fail(f"{label} {signature} is missing per-IP connection limit", failures)
    for inherited in (
        "limit_conn global_conn 400;",
        "proxy_connect_timeout 2s;",
        "proxy_send_timeout 125s;",
        "proxy_read_timeout 125s;",
    ):
        if config.count(inherited) != 2:
            fail(f"{label} must set {inherited} once for each public application host", failures)


def main() -> int:
    compose = COMPOSE_PATH.read_text(encoding="utf-8")
    failures: list[str] = []

    if not NGINX_PATH.is_file():
        fail(f"missing Docker Nginx config: {NGINX_PATH.relative_to(ROOT)}", failures)
        nginx = ""
    else:
        nginx = NGINX_PATH.read_text(encoding="utf-8")

    if not re.search(r"(?m)^  nginx:\n", compose):
        fail("production Compose is missing nginx service", failures)
    else:
        nginx_service = re.search(
            r"(?ms)^  nginx:\n(?P<body>.*?)(?=^  [a-zA-Z0-9_-]+:\n|^volumes:\n|^networks:\n|\Z)",
            compose,
        )
        block = nginx_service.group("body") if nginx_service else ""
        for required in (
            "${NGINX_CONFIG_FILE:-docker-vietsage.conf}",
            "condition: service_healthy",
            "healthcheck:",
            "- edge",
        ):
            if required not in block:
                fail(f"nginx service is missing: {required}", failures)
        if '"127.0.0.1:${NGINX_HTTP_PORT:-80}:8080"' not in block:
            fail(
                "nginx HTTP port must bind to loopback so untrusted clients cannot spoof forwarded IPs",
                failures,
            )
        if '"127.0.0.1:${NGINX_HTTPS_PORT:-443}:8443"' not in block:
            fail(
                "nginx HTTPS port must bind to loopback so untrusted clients cannot bypass the host edge",
                failures,
            )

    if nginx:
        verify_rate_limits("Docker HTTP Nginx", nginx, failures)
        if "127.0.0.1:3000" in nginx or "127.0.0.1:8080" in nginx:
            fail("Docker Nginx config must not use host-loopback upstreams", failures)
        required_routes = {
            "frontend upstream": "http://frontend:3000",
            "backend upstream": "http://auth-service:8080",
            "Auth.js route": "location /api/auth/",
            "backend API route": "location /api/",
            "Socket.IO route": "location /socket.io/",
            "public API health route": "location = /api/health",
            "Nginx health route": "location = /nginx-health",
            "apex domains": "server_name vietsage.com www.vietsage.com",
            "stay domain": "server_name stay.vietsage.com",
        }
        for label, required in required_routes.items():
            if required not in nginx:
                fail(f"Docker Nginx config is missing {label}: {required}", failures)
        for header in (
            "proxy_set_header Host $host",
            "proxy_set_header X-Real-IP $remote_addr",
            "proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for",
            "proxy_set_header X-Forwarded-Proto $scheme",
            "proxy_set_header Upgrade $http_upgrade",
        ):
            if header not in nginx:
                fail(f"Docker Nginx config is missing proxy header: {header}", failures)
        if "geolocation=(self)" not in nginx or "geolocation=()" in nginx:
            fail("Docker Nginx must allow same-origin browser geolocation", failures)
        if "camera=(self)" not in nginx or "camera=()" in nginx:
            fail("Docker Nginx must allow same-origin camera access for biometric scanning", failures)
        mobile_blocks = location_blocks(nginx, "location ^~ /api/cccd-mobile/ {")
        if len(mobile_blocks) != 2 or any("access_log off;" not in block for block in mobile_blocks):
            fail("both public hosts must disable mobile relay access logs", failures)
        for required in ("client_max_body_size 16m", "proxy_request_buffering off", "proxy_buffering off"):
            if nginx.count(required) != 2:
                fail(f"both public hosts must stream bounded mobile document uploads: {required}", failures)

    tls_nginx = TLS_NGINX_PATH.read_text(encoding="utf-8") if TLS_NGINX_PATH.is_file() else ""
    if not tls_nginx:
        fail("missing Docker TLS Nginx config", failures)
    else:
        verify_rate_limits("Docker TLS Nginx", tls_nginx, failures)

    host_nginx = HOST_NGINX_PATH.read_text(encoding="utf-8") if HOST_NGINX_PATH.is_file() else ""
    if not host_nginx:
        fail("missing host Nginx config", failures)
    else:
        if host_nginx.count("location ^~ /api/cccd-mobile/ {\n        access_log off;") != 2:
            fail("both host-Nginx public hosts must disable mobile relay access logs", failures)
        for required in ("client_max_body_size 16m", "proxy_request_buffering off", "proxy_buffering off"):
            if host_nginx.count(required) != 2:
                fail(f"both host-Nginx public hosts must stream bounded mobile document uploads: {required}", failures)

    if failures:
        print("Production Nginx verification FAILED:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("Production Nginx verification passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

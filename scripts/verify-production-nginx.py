#!/usr/bin/env python3
"""Static regression checks for Docker-managed production Nginx routing."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE_PATH = ROOT / "docker-compose.prod.yml"
NGINX_PATH = ROOT / "deploy/nginx/docker-vietsage.conf"
HOST_NGINX_PATH = ROOT / "deploy/nginx/vietsage.conf"


def fail(message: str, failures: list[str]) -> None:
    failures.append(message)


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
        if '"${NGINX_HTTP_PORT:-80}:8080"' not in block and '"80:8080"' not in block:
            fail("nginx service must publish configurable HTTP port to unprivileged container port 8080", failures)

    if nginx:
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
        if nginx.count("location ^~ /api/cccd-mobile/ {\n        access_log off;") != 2:
            fail("both public hosts must disable mobile relay access logs", failures)
        for required in ("client_max_body_size 16m", "proxy_request_buffering off", "proxy_buffering off"):
            if nginx.count(required) != 2:
                fail(f"both public hosts must stream bounded mobile document uploads: {required}", failures)

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

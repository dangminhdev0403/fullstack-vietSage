#!/usr/bin/env python3
"""Static regression checks for the production Docker Compose topology."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE_PATH = ROOT / "docker-compose.prod.yml"
APP_SERVICES = ("auth-service", "frontend")


def service_block(compose: str, service: str) -> str:
    match = re.search(
        rf"(?ms)^  {re.escape(service)}:\n(?P<body>.*?)(?=^  [a-zA-Z0-9_-]+:\n|^volumes:\n|^networks:\n|\Z)",
        compose,
    )
    if not match:
        raise AssertionError(f"missing service: {service}")
    return match.group("body")


def _check_frontend_build(compose: str, failures: list[str]) -> None:
    frontend = service_block(compose, "frontend")
    context_match = re.search(r"(?m)^      context: (.+)$", frontend)
    if not context_match:
        failures.append("frontend build context is missing")
    else:
        context = context_match.group(1).strip().strip('"\'')
        if not (ROOT / context).is_dir():
            failures.append(f"frontend build context does not exist: {context}")

    frontend_dockerfile = (ROOT / "frontends/front-end-vietsage/Dockerfile").read_text(encoding="utf-8")
    if "--mount=type=secret,id=frontend_build_auth,required=true" not in frontend_dockerfile:
        failures.append("frontend build must consume an ephemeral BuildKit auth secret")
    if "frontend_build_auth" not in frontend:
        failures.append("frontend Compose build must provide the ephemeral auth secret")
    if not re.search(
        r"(?ms)^secrets:\n.*?^  frontend_build_auth:\n    environment: FRONTEND_BUILD_AUTH_SECRET$",
        compose,
    ):
        failures.append("production Compose must source frontend build auth from the process environment")


def _check_app_services(compose: str, failures: list[str]) -> None:
    for service in APP_SERVICES:
        block = service_block(compose, service)
        if re.search(r"(?m)^    ports:\n", block):
            failures.append(f"{service} must not publish host ports in production")
        volume_entries = re.findall(r'(?m)^ {6}- ["\']?([^"\'\n:]+)', block)
        for mount_source in volume_entries:
            if mount_source.startswith(("./src", "./frontends", "./services")):
                failures.append(f"{service} must not mount source volumes in production")
        for forbidden in ("next dev", "start:dev", "--watch", "npm run dev", "pnpm dev"):
            if forbidden in block:
                failures.append(f"{service} contains production-forbidden command: {forbidden}")
        for required in ("read_only: true", "no-new-privileges:true", "cap_drop:"):
            if required not in block:
                failures.append(f"{service} is missing hardening setting: {required}")
        if "healthcheck:" not in block:
            failures.append(f"{service} is missing a healthcheck")


def _check_auth_postgres_networks(compose: str, failures: list[str]) -> None:
    auth = service_block(compose, "auth-service")
    credential_mount = (
        '"./secrets/production/google-service-account.json:'
        '/run/secrets/google-service-account.json:ro"'
    )
    if credential_mount not in auth:
        failures.append("auth-service must mount the external Google service account read-only")

    postgres = service_block(compose, "postgres")
    if re.search(r"(?m)^    ports:\n", postgres):
        failures.append("postgres must not publish host ports in production")

    if "networks:" not in compose:
        failures.append("production Compose must define explicit networks")
    else:
        for service in ("postgres", *APP_SERVICES):
            if "networks:" not in service_block(compose, service):
                failures.append(f"{service} must attach to explicit production networks")


def main() -> int:
    compose = COMPOSE_PATH.read_text(encoding="utf-8")
    failures: list[str] = []

    _check_frontend_build(compose, failures)
    _check_app_services(compose, failures)
    _check_auth_postgres_networks(compose, failures)

    if failures:
        print("Production topology verification FAILED:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("Production topology verification passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())


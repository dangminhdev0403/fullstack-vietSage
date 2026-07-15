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


def main() -> int:
    compose = COMPOSE_PATH.read_text(encoding="utf-8")
    failures: list[str] = []

    frontend = service_block(compose, "frontend")
    context_match = re.search(r"(?m)^      context: (.+)$", frontend)
    if not context_match:
        failures.append("frontend build context is missing")
    else:
        context = context_match.group(1).strip().strip('"\'')
        if not (ROOT / context).is_dir():
            failures.append(f"frontend build context does not exist: {context}")

    for service in APP_SERVICES:
        block = service_block(compose, service)
        if re.search(r"(?m)^    ports:\n", block):
            failures.append(f"{service} must not publish host ports in production")
        if re.search(r"(?m)^    volumes:\n", block):
            failures.append(f"{service} must not mount source volumes in production")
        for forbidden in ("next dev", "start:dev", "--watch", "npm run dev", "pnpm dev"):
            if forbidden in block:
                failures.append(f"{service} contains production-forbidden command: {forbidden}")
        for required in ("read_only: true", "no-new-privileges:true", "cap_drop:"):
            if required not in block:
                failures.append(f"{service} is missing hardening setting: {required}")
        if "healthcheck:" not in block:
            failures.append(f"{service} is missing a healthcheck")

    postgres = service_block(compose, "postgres")
    if re.search(r"(?m)^    ports:\n", postgres):
        failures.append("postgres must not publish host ports in production")

    if "networks:" not in compose:
        failures.append("production Compose must define explicit networks")
    else:
        for service in ("postgres", *APP_SERVICES):
            if "networks:" not in service_block(compose, service):
                failures.append(f"{service} must attach to explicit production networks")

    if failures:
        print("Production topology verification FAILED:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("Production topology verification passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

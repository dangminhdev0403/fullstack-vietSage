#!/usr/bin/env python3
"""Static production resource, logging, and container-hardening regression checks."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ROOT / "docker-compose.prod.yml"
DOCKERFILES = {
    "auth-service": ROOT / "services/auth-service/Dockerfile",
    "frontend": ROOT / "frontends/front-end-vietsage/Dockerfile",
}
SERVICES = ("postgres", "migrate", "auth-service", "frontend", "nginx", "certbot")
APP_SERVICES = ("migrate", "auth-service", "frontend", "nginx", "certbot")


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

    for service in SERVICES:
        try:
            block = service_block(compose, service)
        except AssertionError as error:
            failures.append(str(error))
            continue

        for required in (
            "mem_limit:",
            "cpus:",
            "pids_limit:",
            "logging:",
            'driver: "json-file"',
            'max-size: "10m"',
            'max-file: "5"',
        ):
            if required not in block:
                failures.append(f"{service} is missing hardening setting: {required}")

        if service in APP_SERVICES:
            for required in ("read_only: true", "no-new-privileges:true", "cap_drop:", "- ALL"):
                if required not in block:
                    failures.append(f"{service} is missing security setting: {required}")

    for service, dockerfile_path in DOCKERFILES.items():
        dockerfile = dockerfile_path.read_text(encoding="utf-8")
        if not re.search(r"(?m)^USER (?!root\b)\S+", dockerfile):
            failures.append(f"{service} image must declare a non-root USER")

    lowered = compose.lower()
    for forbidden in ("npm run dev", "pnpm dev", "prisma studio", "tail -f", "sleep infinity"):
        if forbidden in lowered:
            failures.append(f"production Compose contains forbidden startup command: {forbidden}")

    if failures:
        print("Production hardening verification FAILED:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("Production hardening verification passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

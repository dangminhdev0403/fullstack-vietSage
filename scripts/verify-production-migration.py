#!/usr/bin/env python3
"""Static regression checks for the production Prisma release flow."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE_PATH = ROOT / "docker-compose.prod.yml"
DOCKERFILE_PATH = ROOT / "services/auth-service/Dockerfile"
FORBIDDEN = ("prisma db push", "migrate reset", "prisma reset", "prisma:reset", "prisma:push")


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

    try:
        migrate = service_block(compose, "migrate")
    except AssertionError as error:
        failures.append(str(error))
        migrate = ""

    if migrate:
        for required in (
            'image: "${AUTH_SERVICE_IMAGE:-vietsage-auth-service:prod}"',
            "restart: \"no\"",
            "condition: service_healthy",
            "- backend",
        ):
            if required not in migrate:
                failures.append(f"migrate service is missing: {required}")
        for command_token in ("node_modules/.bin/prisma", '"migrate"', '"deploy"'):
            if command_token not in migrate:
                failures.append(f"migrate service command is missing token: {command_token}")
        if re.search(r"(?m)^    ports:\n", migrate):
            failures.append("migrate service must not publish ports")

    try:
        auth = service_block(compose, "auth-service")
    except AssertionError as error:
        failures.append(str(error))
        auth = ""

    if auth:
        migrate_dependency = re.search(
            r"(?ms)^      migrate:\n(?P<body>.*?)(?=^      [a-zA-Z0-9_-]+:\n|^    [a-zA-Z0-9_-]+:|\Z)",
            auth,
        )
        if not migrate_dependency or "condition: service_completed_successfully" not in migrate_dependency.group("body"):
            failures.append("auth-service must wait for migrate to complete successfully")

    dockerfile = DOCKERFILE_PATH.read_text(encoding="utf-8")
    if not re.search(
        r"(?m)^COPY --from=builder --chown=node:node /app/prisma\.config\.ts ./prisma\.config\.ts$",
        dockerfile,
    ):
        failures.append("auth-service runtime image must include prisma.config.ts")

    lowered = compose.lower()
    for forbidden in FORBIDDEN:
        if forbidden in lowered:
            failures.append(f"production Compose contains forbidden migration command: {forbidden}")

    if failures:
        print("Production migration verification FAILED:")
        for failure in failures:
            print(f"- {failure}")
        return 1

    print("Production migration verification passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

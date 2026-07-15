#!/usr/bin/env python3
"""Static checks for safe production PostgreSQL backup/restore tooling."""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
BACKUP = ROOT / "scripts/backup-production-postgres.sh"
RESTORE = ROOT / "scripts/restore-production-postgres.sh"


def main() -> int:
    failures: list[str] = []
    for path, label in ((BACKUP, "backup"), (RESTORE, "restore")):
        if not path.is_file():
            failures.append(f"missing {label} script: {path.relative_to(ROOT)}")
            continue
        text = path.read_text(encoding="utf-8")
        if "set -euo pipefail" not in text:
            failures.append(f"{label} script must use strict shell mode")
        if "secrets/production/postgres.env" not in text:
            failures.append(f"{label} script must use the ignored production PostgreSQL env file")

    if BACKUP.is_file():
        text = BACKUP.read_text(encoding="utf-8")
        for required in ("pg_dump", "--format=custom", "--no-owner", "--no-privileges", "sha256sum"):
            if required not in text:
                failures.append(f"backup script is missing: {required}")

    if RESTORE.is_file():
        text = RESTORE.read_text(encoding="utf-8")
        for required in ("pg_restore", "createdb", "target database already exists", "must differ from the source database", "--exit-on-error"):
            if required not in text:
                failures.append(f"restore script is missing safety behavior: {required}")
        lowered = text.lower()
        if "dropdb" in lowered or "drop database" in lowered:
            failures.append("restore script must not drop an existing database")

    if failures:
        print("Production backup verification FAILED:")
        for failure in failures:
            print(f"- {failure}")
        return 1
    print("Production backup verification passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())

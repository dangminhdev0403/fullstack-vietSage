#!/usr/bin/env python3
"""Static safety contract for the dependency-free local HTTP load harness."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HARNESS = ROOT / "scripts/load-test.mjs"

required = (
    "127.0.0.1",
    "localhost",
    "LOAD_TEST_ALLOW_REMOTE",
    "AbortSignal.timeout",
    "p95Ms",
    "p99Ms",
    "errorRate",
    "process.exitCode = 1",
)

text = HARNESS.read_text(encoding="utf-8") if HARNESS.exists() else ""
missing = [value for value in required if value not in text]
if missing:
    raise SystemExit("Load harness verification FAILED: " + ", ".join(missing))

print("Load harness verification passed")
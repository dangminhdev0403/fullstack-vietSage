#!/usr/bin/env node

import { performance } from "node:perf_hooks";

function positiveInteger(raw, fallback, name) {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function percentile(sorted, ratio) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
}

const target = new URL(process.argv[2] ?? "http://127.0.0.1:8080/health/ready");
const total = positiveInteger(process.argv[3], 1_000, "total");
const concurrency = Math.min(total, positiveInteger(process.argv[4], 50, "concurrency"));
const timeoutMs = positiveInteger(process.env.LOAD_TEST_TIMEOUT_MS, 2_000, "LOAD_TEST_TIMEOUT_MS");
const maxErrorRate = Number(process.env.LOAD_TEST_MAX_ERROR_RATE ?? "0");
const maxP99Ms = positiveInteger(process.env.LOAD_TEST_MAX_P99_MS, timeoutMs, "LOAD_TEST_MAX_P99_MS");
const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);

if (!localHosts.has(target.hostname) && process.env.LOAD_TEST_ALLOW_REMOTE !== "1") {
  throw new Error("Remote load tests require LOAD_TEST_ALLOW_REMOTE=1 and explicit target approval");
}
if (!Number.isFinite(maxErrorRate) || maxErrorRate < 0 || maxErrorRate > 1) {
  throw new Error("LOAD_TEST_MAX_ERROR_RATE must be between 0 and 1");
}

let next = 0;
let succeeded = 0;
let failed = 0;
const statuses = new Map();
const durations = [];

async function worker() {
  while (true) {
    const index = next++;
    if (index >= total) return;
    const startedAt = performance.now();
    try {
      const response = await fetch(target, { signal: AbortSignal.timeout(timeoutMs) });
      await response.arrayBuffer();
      statuses.set(response.status, (statuses.get(response.status) ?? 0) + 1);
      if (response.ok) succeeded += 1;
      else failed += 1;
    } catch {
      failed += 1;
      statuses.set("network", (statuses.get("network") ?? 0) + 1);
    } finally {
      durations.push(performance.now() - startedAt);
    }
  }
}

const startedAt = performance.now();
await Promise.all(Array.from({ length: concurrency }, worker));
const elapsedMs = performance.now() - startedAt;
durations.sort((a, b) => a - b);
const errorRate = failed / total;
const result = {
  target: target.toString(),
  total,
  concurrency,
  succeeded,
  failed,
  errorRate: Number(errorRate.toFixed(4)),
  throughputRps: Number((total / (elapsedMs / 1_000)).toFixed(1)),
  elapsedMs: Number(elapsedMs.toFixed(1)),
  p50Ms: Number(percentile(durations, 0.5).toFixed(1)),
  p95Ms: Number(percentile(durations, 0.95).toFixed(1)),
  p99Ms: Number(percentile(durations, 0.99).toFixed(1)),
  maxMs: Number((durations.at(-1) ?? 0).toFixed(1)),
  statuses: Object.fromEntries([...statuses.entries()].sort(([a], [b]) => String(a).localeCompare(String(b)))),
};

console.log(JSON.stringify(result, null, 2));
if (errorRate > maxErrorRate || result.p99Ms > maxP99Ms) process.exitCode = 1;

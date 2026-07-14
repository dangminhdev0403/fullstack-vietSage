import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function source(relativePath) {
  return readFile(path.join(root, relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const [authTypes, authSource, proxySource, serviceSource, refreshSource, publicPaths] =
  await Promise.all([
    source("src/types/next-auth.d.ts"),
    source("src/lib/auth.ts"),
    source("src/proxy.ts"),
    source("src/features/auth/service/auth-service.ts"),
    source("src/lib/auth-session-refresh.ts"),
    source("src/core/http/public-api-paths.ts"),
  ]);

const checks = [
  ["session type exposes safe canRefresh metadata", () => {
    assert(/canRefresh:\s*boolean/.test(authTypes), "Session type must declare canRefresh boolean");
  }],
  ["session callback derives canRefresh without exposing tokens", () => {
    assert(/session\.canRefresh\s*=/.test(authSource), "session callback must assign canRefresh");
    assert(!/session\.(accessToken|refreshToken)\s*=/.test(authSource), "session callback must not expose raw tokens");
  }],
  ["proxy gates on canRefresh instead of raw refreshToken", () => {
    assert(/session\?\.canRefresh\s*===\s*true/.test(proxySource), "proxy must read session.canRefresh");
    assert(!/getStringTokenField\(session,\s*["']refreshToken["']\)/.test(proxySource), "proxy must not read session.refreshToken");
  }],
  ["logout is private bearer-token transport", () => {
    assert(!publicPaths.includes('"/auth/logout"'), "/auth/logout must not be in the public allowlist");
    assert(/async logout\(accessToken:\s*string\)/.test(serviceSource), "logout must accept an access token");
    const logoutStart = serviceSource.indexOf("async logout(");
    const logoutEnd = serviceSource.indexOf("async me(", logoutStart);
    const logoutBlock = serviceSource.slice(logoutStart, logoutEnd);
    assert(/accessToken,/.test(logoutBlock), "logout request must attach accessToken");
    assert(!/refreshToken/.test(logoutBlock), "logout request must not send refreshToken");
  }],
  ["refresh forwards a stable idempotency key", () => {
    assert(/Idempotency-Key/.test(serviceSource), "refresh service must forward Idempotency-Key");
    assert(/idempotencyKey/.test(refreshSource), "refresh coordinator must own an idempotency key");
  }],
  ["refresh gate leaves headroom for short-lived access tokens", () => {
    const earlyMs = Number(proxySource.match(/REFRESH_SESSION_EARLY_MS\s*=\s*([\d_]+)/)?.[1].replaceAll("_", ""));
    assert(earlyMs > 0 && earlyMs < 10_000, "proxy refresh threshold must be below the 10-second development TTL");
  }],
];

let failures = 0;
for (const [name, run] of checks) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("PASS all auth session contract smoke checks");
}

import http from "node:http";
import { once } from "node:events";

const CONCURRENT_REQUESTS = 5;

function createServer({ refreshShouldSucceed }) {
  const state = {
    refreshCount: 0,
    refreshed: false,
    protectedAttempts: new Map(),
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/api/protected") {
      const requestId = url.searchParams.get("requestId") ?? "missing";
      const attempts = (state.protectedAttempts.get(requestId) ?? 0) + 1;
      state.protectedAttempts.set(requestId, attempts);

      if (!state.refreshed) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "unauthorized" }));
        return;
      }

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, requestId, attempts }));
      return;
    }

    if (url.pathname === "/api/auth/refresh-session" && req.method === "POST") {
      state.refreshCount += 1;

      if (!refreshShouldSucceed) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "refresh_failed" }));
        return;
      }

      state.refreshed = true;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, accessTokenExpiresAt: Date.now() + 60_000 }));
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not_found" }));
  });

  return { server, state };
}

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();

  if (!address || typeof address === "string") {
    throw new Error("Mock server did not bind to a TCP port.");
  }

  return `http://127.0.0.1:${address.port}`;
}

function createRefreshCoordinator(baseUrl, signalLogoutRequired) {
  let refreshPromise = null;
  let logoutRequiredEmitted = false;

  async function refreshSessionOnce() {
    if (!refreshPromise) {
      refreshPromise = fetch(`${baseUrl}/api/auth/refresh-session`, {
        method: "POST",
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Refresh failed with ${response.status}`);
          }

          return response.json();
        })
        .finally(() => {
          refreshPromise = null;
        });
    }

    return refreshPromise;
  }

  function emitLogoutRequiredOnce() {
    if (logoutRequiredEmitted) {
      return;
    }

    logoutRequiredEmitted = true;
    signalLogoutRequired();
  }

  return { refreshSessionOnce, emitLogoutRequiredOnce };
}

async function requestInternalApiLike(baseUrl, requestId, coordinator) {
  const url = `${baseUrl}/api/protected?requestId=${encodeURIComponent(requestId)}`;
  let response = await fetch(url);

  if (response.status !== 401) {
    return response;
  }

  try {
    await coordinator.refreshSessionOnce();
  } catch (error) {
    coordinator.emitLogoutRequiredOnce();
    throw error;
  }

  response = await fetch(url);

  if (response.status === 401) {
    coordinator.emitLogoutRequiredOnce();
  }

  return response;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function withMockServer(options, test) {
  const { server, state } = createServer(options);
  const baseUrl = await listen(server);

  try {
    await test(baseUrl, state);
  } finally {
    server.close();
    await once(server, "close");
  }
}

async function runSuccessScenario() {
  await withMockServer({ refreshShouldSucceed: true }, async (baseUrl, state) => {
    let logoutSignalCount = 0;
    const coordinator = createRefreshCoordinator(baseUrl, () => {
      logoutSignalCount += 1;
    });

    const responses = await Promise.all(
      Array.from({ length: CONCURRENT_REQUESTS }, (_, index) =>
        requestInternalApiLike(baseUrl, `success-${index}`, coordinator),
      ),
    );

    assert(state.refreshCount === 1, `expected 1 refresh, got ${state.refreshCount}`);
    assert(logoutSignalCount === 0, `expected 0 logout signals, got ${logoutSignalCount}`);
    assert(responses.every((response) => response.ok), "expected all final responses to be OK");

    for (const [requestId, attempts] of state.protectedAttempts) {
      assert(attempts <= 2, `expected ${requestId} to attempt <= 2 times, got ${attempts}`);
    }

    return {
      refreshCount: state.refreshCount,
      maxAttempts: Math.max(...state.protectedAttempts.values()),
      okResponses: responses.filter((response) => response.ok).length,
    };
  });
}

async function runFailureScenario() {
  await withMockServer({ refreshShouldSucceed: false }, async (baseUrl, state) => {
    let logoutSignalCount = 0;
    const coordinator = createRefreshCoordinator(baseUrl, () => {
      logoutSignalCount += 1;
    });

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_REQUESTS }, (_, index) =>
        requestInternalApiLike(baseUrl, `failure-${index}`, coordinator),
      ),
    );

    assert(state.refreshCount === 1, `expected 1 refresh, got ${state.refreshCount}`);
    assert(logoutSignalCount === 1, `expected 1 logout signal, got ${logoutSignalCount}`);
    assert(
      results.every((result) => result.status === "rejected"),
      "expected every logical request to reject after refresh failure",
    );

    for (const [requestId, attempts] of state.protectedAttempts) {
      assert(attempts === 1, `expected ${requestId} to attempt once, got ${attempts}`);
    }

    return {
      refreshCount: state.refreshCount,
      logoutSignalCount,
      rejectedRequests: results.filter((result) => result.status === "rejected").length,
    };
  });
}

const checks = [
  ["success", runSuccessScenario],
  ["refresh failure", runFailureScenario],
];

let failures = 0;

console.log("Auth refresh smoke harness: deterministic mock of browser BFF 401 recovery.");
console.log("This does not validate real browser cookies or backend refresh-token rotation.");

for (const [name, run] of checks) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log("PASS all auth refresh smoke checks");
}

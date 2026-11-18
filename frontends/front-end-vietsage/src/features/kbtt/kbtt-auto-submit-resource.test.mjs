import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { QueryClient } from "@tanstack/react-query";
import * as queryResource from "@dangminhdev04032005/query-resource";
import * as contracts from "./types/kbtt-contract.ts";

const require = createRequire(import.meta.url);
function load(file, imports) {
  const code = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "exports", "module", code)(name => name in imports ? imports[name] : require(name), module.exports, module);
  return module.exports;
}
function setup(transport) {
  const repository = load("./repositories/kbtt-repository.ts", {
    "@/core/http/internal-api-client": { requestInternalApiEnvelope: transport },
    "../types/kbtt-contract": contracts,
  });
  const { kbttResource } = load("./resources/kbtt-resource.ts", {
    "@dangminhdev04032005/query-resource": queryResource,
    "../repositories/kbtt-repository": repository,
  });
  return { kbttResource, repository: repository.kbttRepository };
}
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false, gcTime: Infinity } } });

test("BCA enabled control sends only the hotel flag and validates server state", async () => {
  assert.equal(contracts.kbttAutoSubmitConfigSchema.safeParse({}).success, false);
  const calls = [];
  const { repository } = setup(async (url, options) => { calls.push({ url, options }); return { data: { autoSubmitEnabled: true } }; });
  const controller = new AbortController();
  assert.deepEqual(await repository.getAutoSubmitEnabled("a/b", controller.signal), { autoSubmitEnabled: true });
  await repository.updateAutoSubmitEnabled("a/b", { autoSubmitEnabled: false });
  assert.equal(calls[0].url, "/api/hotel-ops/hotels/a%2Fb/kbtt/auto-submit/enabled");
  assert.equal(calls[0].options.signal, controller.signal);
  assert.deepEqual(calls[1].options, { method: "PUT", body: { autoSubmitEnabled: false } });
  await assert.rejects(repository.updateAutoSubmitEnabled("a/b", { autoSubmitEnabled: true, autoSubmitTime: "03:00" }));
  assert.equal(calls.length, 2);
  const invalid = setup(async () => ({ data: { autoSubmitEnabled: "false" } }));
  await assert.rejects(invalid.repository.getAutoSubmitEnabled("a"));
});

test("tenant and receptionist share persisted enabled state while hotel caches stay isolated", async () => {
  let enabled = false;
  const { kbttResource } = setup(async (_url, options) => {
    if (options.method === "PUT") enabled = options.body.autoSubmitEnabled;
    return { data: { autoSubmitEnabled: enabled } };
  });
  const tenant = client();
  const reception = client();
  const a = kbttResource.bind({ hotelId: "a" });
  const b = kbttResource.bind({ hotelId: "b" });
  try {
    await Promise.all([a.queries.autoSubmitEnabled.fetch(tenant, undefined), a.queries.autoSubmitEnabled.fetch(reception, undefined)]);
    a.queries.autoSubmitConfig.set(tenant, undefined, { autoSubmitEnabled: false, autoSubmitTime: "04:30", recentRuns: [] });
    b.queries.autoSubmitEnabled.set(tenant, undefined, { autoSubmitEnabled: false });
    await tenant.getMutationCache().build(tenant, a.mutations.updateAutoSubmitEnabled.options()).execute({ autoSubmitEnabled: true });
    assert.equal(tenant.getQueryState(a.queries.autoSubmitConfig.key(undefined)).isInvalidated, true);
    assert.equal(tenant.getQueryState(b.queries.autoSubmitEnabled.key(undefined)).isInvalidated, false);
    await a.queries.autoSubmitEnabled.fetch(reception, undefined);
    assert.equal(a.queries.autoSubmitEnabled.get(reception, undefined).autoSubmitEnabled, true);
    await reception.getMutationCache().build(reception, a.mutations.updateAutoSubmitEnabled.options()).execute({ autoSubmitEnabled: false });
    await a.queries.autoSubmitEnabled.fetch(tenant, undefined);
    assert.equal(a.queries.autoSubmitEnabled.get(tenant, undefined).autoSubmitEnabled, false);
  } finally { tenant.clear(); reception.clear(); }
});

test("failed BCA toggle retains confirmed cache and updateAutoSubmitConfig rejects retired custom autoSubmitTime", async () => {
  const calls = [];
  const { kbttResource, repository } = setup(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/enabled")) throw new Error("Access denied");
    return { data: { autoSubmitEnabled: true, autoSubmitTime: null } };
  });
  const cache = client();
  const a = kbttResource.bind({ hotelId: "a" });
  try {
    a.queries.autoSubmitEnabled.set(cache, undefined, { autoSubmitEnabled: false });
    await assert.rejects(cache.getMutationCache().build(cache, a.mutations.updateAutoSubmitEnabled.options()).execute({ autoSubmitEnabled: true }), /Access denied/);
    assert.equal(a.queries.autoSubmitEnabled.get(cache, undefined).autoSubmitEnabled, false);
    await assert.rejects(repository.updateAutoSubmitConfig("a", { autoSubmitEnabled: true, autoSubmitTime: "05:00" }));
    await assert.rejects(repository.updateAutoSubmitConfig("a", { autoSubmitTime: "05:00" }));
    assert.equal(calls.length, 1);
    await repository.updateAutoSubmitConfig("a", { autoSubmitEnabled: true, autoSubmitTime: null });
    assert.deepEqual(calls[1].options.body, { autoSubmitEnabled: true, autoSubmitTime: null });
  } finally { cache.clear(); }
});

test("shared BCA control refreshes separate sessions and caches successful writes", async () => {
  const { kbttResource } = setup(async (_url, options) => ({ data: { autoSubmitEnabled: options.body?.autoSubmitEnabled ?? false } }));
  const cache = client();
  let options;
  const { useKbttAutoSubmitEnabled } = load("./hooks/use-kbtt-auto-submit-enabled.ts", {
    react: { useMemo: fn => fn() },
    "../resources/kbtt-resource": { kbttResource },
    "@tanstack/react-query": {
      useQueryClient: () => cache,
      useQuery: input => { options = input; return {}; },
      useMutation: input => ({ isPending: false, mutateAsync: variables => cache.getMutationCache().build(cache, input).execute(variables) }),
    },
  });
  try {
    const control = useKbttAutoSubmitEnabled("a");
    assert.equal(options.refetchInterval, 5000);
    assert.equal(options.refetchIntervalInBackground, false);
    assert.equal(options.refetchOnWindowFocus, "always");
    assert.equal(options.refetchOnReconnect, "always");
    await control.setEnabled(true);
    assert.equal(kbttResource.bind({ hotelId: "a" }).queries.autoSubmitEnabled.get(cache, undefined).autoSubmitEnabled, true);
    useKbttAutoSubmitEnabled("");
    assert.equal(options.enabled, false);
  } finally { cache.clear(); }
});


test("BCA switch blocks unavailable writes and can still pause a disconnected hotel", async () => {
  let state;
  const writes = [];
  const alerts = [];
  const { KbttAutoSubmitSwitch } = load("./components/kbtt-auto-submit-switch.tsx", {
    react: { useId: () => "bca-switch" },
    "@/core/http/http-error": { HttpError: class extends Error {} },
    "@/libs/swal": { showErrorAlert: async (...args) => alerts.push(args) },
    "../types/kbtt-contract": contracts,
    "../hooks/use-kbtt-auto-submit-enabled": { useKbttAutoSubmitEnabled: () => state },
  });
  function findSwitch(node) {
    if (!node || typeof node !== "object") return null;
    if (node.props?.role === "switch") return node;
    for (const child of [node.props?.children].flat()) {
      const found = findSwitch(child);
      if (found) return found;
    }
    return null;
  }
  const render = (canManage, isConnected) => findSwitch(KbttAutoSubmitSwitch({ hotelId: "a", canManage, isConnected })).props;
  state = { enabled: { isSuccess: true, data: { autoSubmitEnabled: false } }, updating: false, setEnabled: async value => writes.push(value) };
  for (const [canManage, connected] of [[false, true], [true, false]]) {
    const props = render(canManage, connected);
    assert.equal(props.disabled, true);
    props.onClick();
  }
  state.enabled.isSuccess = false;
  render(true, true).onClick();
  assert.deepEqual(writes, []);
  state.enabled = { isSuccess: true, data: { autoSubmitEnabled: true } };
  const pause = render(true, false);
  assert.equal(pause.disabled, false);
  assert.equal(pause["aria-checked"], true);
  pause.onClick();
  assert.deepEqual(writes, [false]);
  state.setEnabled = async () => { throw Error("Không thể lưu cấu hình."); };
  render(true, true).onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(alerts.length, 1);
  assert.equal(render(true, true)["aria-checked"], true);
});

test("auto-submit state schema and delivery status display nextCatchUpAt only when real pending catch-up work exists", () => {
  const withCatchUp = contracts.kbttAutoSubmitStateSchema.parse({
    autoSubmitEnabled: true,
    autoSubmitTime: null,
    nextScheduledSlotAt: "2026-11-18T05:00:00.000Z",
    nextCatchUpAt: "2026-11-18T05:10:00.000Z",
    recentRuns: [],
  });
  assert.equal(withCatchUp.nextCatchUpAt, "2026-11-18T05:10:00.000Z");

  const withoutCatchUp = contracts.kbttAutoSubmitStateSchema.parse({
    autoSubmitEnabled: true,
    autoSubmitTime: null,
    nextScheduledSlotAt: "2026-11-18T05:00:00.000Z",
    nextCatchUpAt: null,
    recentRuns: [],
  });
  assert.equal(withoutCatchUp.nextCatchUpAt, null);

  const connectionHook = load("./hooks/use-kbtt-connection.ts", {
    react: { useCallback: (fn) => fn, useEffect: () => {}, useMemo: (fn) => fn(), useRef: () => ({ current: false }) },
    "@tanstack/react-query": { useQueryClient: () => ({}), useQuery: () => ({}), useMutation: () => ({}) },
    "../resources/kbtt-resource": { kbttResource: { bind: () => ({}) } },
  });
  const { KbttDeliveryStatus } = load("./components/kbtt-delivery-status.tsx", {
    "../types/kbtt-contract": contracts,
    "../hooks/use-kbtt-connection": connectionHook,
  });

  const baseDelivery = {
    mode: "BACKGROUND",
    state: "RUNNING",
    lifecycleEnabled: true,
    pendingCount: 0,
    reviewCount: 0,
    lastSucceededAt: null,
    nextScheduledSlotAt: "2026-11-18T05:00:00.000Z",
    nextCatchUpAt: null,
    recentIssues: [],
  };

  // When nextCatchUpAt is null on both delivery and connection, no catch-up slot is shown
  const idleRender = JSON.stringify(
    KbttDeliveryStatus({
      delivery: baseDelivery,
      connection: {
        configured: true,
        status: "CONNECTED",
        username: "demo_tich_hop",
        maskedUsername: "d***p",
        csltId: "123",
        lastCheckedAt: null,
        lastConnectedAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        nextCatchUpAt: null,
        providerProfile: { state: "NOT_LOADED", accommodation: null, fetchedAt: null, error: null },
      },
      isLoading: false,
      hasError: false,
    }),
  );
  assert.doesNotMatch(idleRender, /Gửi bù 10 phút/);

  // When pending work sets nextCatchUpAt, it is displayed alongside temporary disconnect status
  const activeCatchUpRender = JSON.stringify(
    KbttDeliveryStatus({
      delivery: { ...baseDelivery, pendingCount: 2, nextCatchUpAt: "2026-11-18T05:10:00.000Z" },
      connection: {
        configured: true,
        status: "DISCONNECTED",
        username: "demo_tich_hop",
        maskedUsername: "d***p",
        csltId: "123",
        lastCheckedAt: null,
        lastConnectedAt: null,
        lastErrorCode: "KBTT_TEMP_DISCONNECTED",
        lastErrorMessage: null,
        cooldownUntil: "2026-11-18T05:01:00.000Z",
        nextCatchUpAt: "2026-11-18T05:10:00.000Z",
        providerProfile: { state: "NOT_LOADED", accommodation: null, fetchedAt: null, error: null },
      },
      isLoading: false,
      hasError: false,
    }),
  );
  assert.match(activeCatchUpRender, /Tạm ngắt kết nối BCA — đang chờ kết nối lại/);
  assert.match(activeCatchUpRender, /Gửi bù 10 phút/);

  // OUT_OF_DATE_WINDOW and PRIOR_DAY_MANUAL issues render out-of-window manual message
  const outOfWindowRender = JSON.stringify(
    KbttDeliveryStatus({
      delivery: {
        ...baseDelivery,
        reviewCount: 1,
        recentIssues: [
          {
            id: "issue-out-of-window",
            kind: "INITIAL",
            status: "BLOCKED",
            roomNumber: "101",
            fullName: "Nguyen Van A",
            message: "OUT_OF_DATE_WINDOW",
            updatedAt: "2026-11-18T05:00:00.000Z",
          },
        ],
      },
      isLoading: false,
      hasError: false,
    }),
  );
  assert.match(outOfWindowRender, /Quá hạn ngày — gửi thủ công/);
});

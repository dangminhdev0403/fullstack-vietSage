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

test("failed BCA toggle retains confirmed cache and time-only updates omit the enabled flag", async () => {
  const calls = [];
  const { kbttResource, repository } = setup(async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith("/enabled")) throw new Error("Access denied");
    return { data: { autoSubmitEnabled: false, autoSubmitTime: "05:00" } };
  });
  const cache = client();
  const a = kbttResource.bind({ hotelId: "a" });
  try {
    a.queries.autoSubmitEnabled.set(cache, undefined, { autoSubmitEnabled: false });
    await assert.rejects(cache.getMutationCache().build(cache, a.mutations.updateAutoSubmitEnabled.options()).execute({ autoSubmitEnabled: true }), /Access denied/);
    assert.equal(a.queries.autoSubmitEnabled.get(cache, undefined).autoSubmitEnabled, false);
    await repository.updateAutoSubmitConfig("a", { autoSubmitTime: "05:00" });
    assert.deepEqual(calls[1].options.body, { autoSubmitTime: "05:00" });
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

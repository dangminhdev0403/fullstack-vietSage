import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import * as zod from "zod";
import { createTable, getCoreRowModel, getFilteredRowModel } from "@tanstack/react-table";
import { kbttReconciliationSchema, canRetryReconciledGuest } from "./types/kbtt-contract.ts";

const row = {
  id: "local-1", source: "VIETSAGE", kind: "VIETNAMESE", occupantId: "occupant-1", stayId: "stay-1", roomId: "room-1",
  roomNumber: "101", groupCode: "GRP-1", fullName: "Khách mẫu", identityNumber: "000000000001", documentType: 1, nationality: "VNM",
  checkedInAt: "2026-11-16T02:00:00Z", plannedCheckOutAt: "2026-11-18T05:00:00Z", status: "NOT_FOUND", reason: null,
  bcaRecordId: null, declarationStatus: "FAILED", providerMessage: null, canRetry: true,
};
const complete = { state: "COMPLETE", checkedAt: "2026-11-16T03:00:00Z", error: null };
const response = { items: [row], checkedAt: null, range: { dateFrom: "2026-11-16", dateTo: "2026-11-16" },
  sources: { VIETNAMESE: complete, FOREIGN: { state: "NEEDS_LOGIN", checkedAt: null, error: { code: "KBTT_SESSION_REQUIRED", message: "Cần đăng nhập lại BCA." } } } };

test("requires both country results and preserves partial failures without defaulting an unsent status", () => {
  const parsed = kbttReconciliationSchema.parse(response);
  assert.equal(parsed.sources.VIETNAMESE.state, "COMPLETE");
  assert.equal(parsed.sources.FOREIGN.state, "NEEDS_LOGIN");
  assert.equal(parsed.checkedAt, null);
  assert.equal(kbttReconciliationSchema.safeParse({ ...response, sources: { VIETNAMESE: complete } }).success, false);
  assert.equal(kbttReconciliationSchema.safeParse({ ...response, items: [{ ...row, status: "UNSENT" }] }).success, false);
  assert.equal(kbttReconciliationSchema.parse({ ...response, items: [{ ...row, status: null, canRetry: false }] }).items[0].status, null);
  assert.equal(kbttReconciliationSchema.safeParse({ ...response, items: null }).success, false);
});

test("only confirmed absent local stays with safe send states can be submitted", () => {
  assert.equal(canRetryReconciledGuest(row), true);
  for (const status of ["MATCHED", "REVIEW", null]) assert.equal(canRetryReconciledGuest({ ...row, status }), false);
  for (const declarationStatus of ["UNKNOWN", "SUBMITTED"]) {
    assert.equal(canRetryReconciledGuest({ ...row, declarationStatus }), false);
    assert.equal(
      kbttReconciliationSchema.safeParse({
        ...response,
        items: [{ ...row, declarationStatus, canRetry: true }],
      }).success,
      false,
    );
  }
  for (const declarationStatus of ["FAILED", "READY", "DRAFT", null]) assert.equal(canRetryReconciledGuest({ ...row, declarationStatus }), true);
  assert.equal(canRetryReconciledGuest({ ...row, source: "BCA_ONLY", occupantId: null }), false);
  assert.equal(canRetryReconciledGuest({ ...row, canRetry: false }), false);
  assert.equal(kbttReconciliationSchema.safeParse({ ...response, items: [{ ...row, source: "BCA_ONLY" }] }).success, false);
  assert.equal(kbttReconciliationSchema.safeParse({ ...response, items: [{ ...row, status: "MATCHED" }] }).success, false);
});

test("reconciliation row status badge and declaration status handle OUT_OF_DATE_WINDOW, PRIOR_DAY_MANUAL, and UNKNOWN without auto-retry", () => {
  const { getReconciliationRowStatusBadge } = loadModule("./components/in-house-declaration-cells.tsx", {
    "react/jsx-runtime": { jsx: () => null, jsxs: () => null, Fragment: "fragment" },
    "react": { useEffect: () => {}, useMemo: (fn) => fn(), useRef: () => ({ current: null }), useState: (v) => [v, () => {}] },
    "@tanstack/react-query": { useMutation: () => ({}), useQuery: () => ({}) },
    "vs-icon": {},
    "check-in-workspace": { formatVnDateInput: (v) => v, toIsoDate: (v) => v },
    "in-house-draft": { buildInlineDraft: () => ({}) },
    "kbtt-resource": { kbttResource: { bind: () => ({}) } },
    "kbtt-contract": {
      sanitizeErrorMessage: (m) => m ?? "",
      getVietnamCalendarDate: (v) => (v ? String(v).slice(0, 10) : null),
      isArrivalDayWithinBcaWindow: (d) => d === "2026-11-18" || d === "2026-11-17",
    },
  });

  // OUT_OF_DATE_WINDOW and PRIOR_DAY_MANUAL render "Gửi lỗi"
  for (const reason of ["OUT_OF_DATE_WINDOW", "PRIOR_DAY_MANUAL", "PRIOR_DAY_MANUAL_REQUIRED"]) {
    const badge = getReconciliationRowStatusBadge({ ...row, reason });
    assert.equal(badge?.label, "Gửi lỗi");
  }
  // Unsent drafts remain distinct from failed attempts, regardless of arrival day.
  assert.equal(
    getReconciliationRowStatusBadge({ ...row, checkedInAt: "2026-11-16T02:00:00Z", declarationStatus: "DRAFT" })?.label,
    "Chưa có",
  );
  assert.equal(
    getReconciliationRowStatusBadge({ ...row, checkedInAt: "2026-11-17T02:00:00Z", declarationStatus: "DRAFT" })?.label,
    "Chưa có",
  );

  for (const declarationStatus of [null, "DRAFT", "READY"]) {
    assert.equal(getReconciliationRowStatusBadge({ ...row, declarationStatus })?.label, "Chưa có");
    assert.equal(getReconciliationRowStatusBadge({ ...row, declarationStatus, status: "MATCHED" })?.label, "Đã có trên BCA");
  }
  // Ambiguous attempts retain the internal no-resend guard under the simplified label.
  const unknownBadge = getReconciliationRowStatusBadge({
    ...row,
    declarationStatus: "UNKNOWN",
    reason: "RECONCILIATION_REQUIRED",
    canRetry: false,
  });
  assert.equal(unknownBadge?.label, "Gửi lỗi");
  assert.equal(getReconciliationRowStatusBadge({ ...row, status: "MATCHED" })?.label, "Đã có trên BCA");
  assert.equal(getReconciliationRowStatusBadge({ ...row, declarationStatus: "SUBMITTED" })?.label, "Đã có trên BCA");
  assert.equal(
    canRetryReconciledGuest({ ...row, declarationStatus: "UNKNOWN", canRetry: false }),
    false,
  );
});

function loadModule(file, dependencies) {
  const source = readFileSync(new URL(file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", compiled)((name) => {
    const key = Object.keys(dependencies).find((part) => name.includes(part));
    if (!key) throw new Error(`Unexpected import ${name}`);
    return dependencies[key];
  }, module, module.exports);
  return module.exports;
}

test("in-house filters do not sustain pagination render updates after fallback data arrives", async () => {
  const source = readFileSync(new URL("./components/in-house-reconciliation.tsx", import.meta.url), "utf8");
  // Execute the production table configuration against the real TanStack scheduler.
  const block = source.slice(source.indexOf("  const globalFilter ="), source.indexOf("  const filtered ="));
  assert.ok(block.includes("useReactTable"));
  const compile = (body) => new Function("useMemo", "useReactTable", "rows", "kind", "needle", "bcaStatus", "room",
    "guestColumns", "getCoreRowModel", "getFilteredRowModel", `${body}\nreturn table;`);
  let build = compile(block);
  const columns = [{ accessorKey: "id" }];
  const rows = [row, { ...row, id: "foreign-1", kind: "FOREIGN", roomNumber: "102" }];
  let memo;
  let dependencies;
  let state;
  let table;
  let updates = 0;
  const useMemo = (factory, next) => {
    if (!dependencies || next.some((value, index) => value !== dependencies[index])) memo = factory();
    dependencies = next;
    return memo;
  };
  const useReactTable = (options) => {
    if (!table) {
      table = createTable({ ...options, state: {}, onStateChange: () => {}, renderFallbackValue: null });
      state = table.initialState;
    }
    table.setOptions((previous) => ({ ...previous, ...options, state: { ...state, ...options.state },
      onStateChange: (updater) => { state = typeof updater === "function" ? updater(state) : updater; updates++; },
    }));
    return table;
  };
  const render = (data, kind = "VIETNAMESE", needle = "", status = "ALL", room = "") =>
    build(useMemo, useReactTable, data, kind, needle, status, room, columns, getCoreRowModel, getFilteredRowModel)
      .getFilteredRowModel().rows.map((entry) => entry.original.id);
  assert.deepEqual(render([]), []);
  await Promise.resolve();
  assert.deepEqual(render(rows), [row.id]);
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    render(rows);
  }
  assert.deepEqual(render(rows, "FOREIGN"), ["foreign-1"]);
  assert.deepEqual(render(rows, "VIETNAMESE", "101", "FAILED", "101"), [row.id]);
  assert.deepEqual(render(rows, "VIETNAMESE", "missing"), []);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(updates, 0, "view-owned pagination must not enqueue table state updates");
  // Negative control: the previous inline filter + default reset sustains updates.
  build = compile(block.replace("state: { globalFilter }", "state: { globalFilter: { kind, needle, bcaStatus, room } }")
    .replace("autoResetPageIndex: false,", ""));
  table = undefined;
  render([]);
  await Promise.resolve();
  for (let i = 0; i < 8; i++) {
    render(rows);
    await Promise.resolve();
    await Promise.resolve();
  }
  assert.ok(updates >= 6, "previous configuration must reproduce repeated scheduler updates");
});

test("one hotel-scoped resource request refreshes both countries, independently of client-side selection", async () => {
  const calls = [];
  let result = response;
  const { kbttResource: config } = loadModule("./resources/kbtt-resource.ts", {
    "query-resource": { createResource: () => (config) => config, defineQuery: (config) => config, defineMutation: (config) => config },
    "kbtt-repository": { kbttRepository: { reconciliation: async (...args) => { calls.push(args); if(result instanceof Error) throw result; return result; } } },
  });
  const signal = new AbortController().signal;
  const query = config.queries.reconciliation;
  assert.deepEqual(query.inputKey(), []);
  const actual = await query.queryFn({ scope: { hotelId: "hotel-1" }, signal });
  assert.equal(actual.sources.VIETNAMESE.state, "COMPLETE");
  assert.equal(actual.sources.FOREIGN.state, "NEEDS_LOGIN");
  assert.deepEqual(calls, [["hotel-1", signal, true]]);
  await config.mutations.refreshReconciliation.mutationFn({ scope: { hotelId: "hotel-1" } });
  assert.deepEqual(calls[1], ["hotel-1", undefined, true]);
  result = new Error("provider source unavailable");
  await assert.rejects(query.queryFn({ scope: { hotelId: "hotel-1" }, signal }), /unavailable/);
});

test("logged-out in-house view reads local guests without scheduling BCA reconciliation and distinguishes temporary disconnect vs login required", () => {
  const cases = [
    {
      connection: { configured: false, status: "DISCONNECTED", lastErrorCode: null },
      expectedText: /Chưa kết nối BCA/,
      expectedPoll: false,
      expectLoginLink: true,
    },
    {
      connection: { configured: true, status: "DISCONNECTED", lastErrorCode: "KBTT_RETRY_PENDING" },
      expectedText: /Đang thử kết nối lại sau 10 giây/,
      expectedPoll: 10_000,
      expectLoginLink: false,
    },
    {
      connection: { configured: true, status: "DISCONNECTED", lastErrorCode: "KBTT_TEMP_DISCONNECTED" },
      expectedText: /Tạm ngắt kết nối BCA — đang chờ kết nối lại/,
      expectedPoll: 15_000,
      expectLoginLink: false,
    },
    {
      connection: {
        configured: true,
        status: "DISCONNECTED",
        lastErrorCode: "KBTT_TEMP_DISCONNECTED",
        cooldownUntil: new Date(Date.now() + 7_000).toISOString(),
      },
      expectedText: /Tạm ngắt kết nối BCA — đang chờ kết nối lại/,
      expectedPollRange: [5_000, 15_000],
      expectLoginLink: false,
    },
    {
      connection: {
        configured: true,
        status: "DISCONNECTED",
        lastErrorCode: "KBTT_FACILITY_CONFLICT",
        lastErrorMessage: "Tài khoản cơ sở BCA này đang được liên kết với một khách sạn khác trên hệ thống.",
      },
      expectedText: /liên kết với một khách sạn khác/,
      expectedPoll: false,
      expectLoginLink: true,
    },
    {
      connection: { configured: true, status: "DISCONNECTED", lastErrorCode: "KBTT_SESSION_ENDED" },
      expectedText: /Cần đăng nhập lại BCA/,
      expectedPoll: false,
      expectLoginLink: true,
    },
    {
      connection: { configured: true, status: "AUTH_FAILED", lastErrorCode: "KBTT_AUTH_FAILED" },
      expectedText: /Cần đăng nhập lại BCA/,
      expectedPoll: false,
      expectLoginLink: true,
    },
  ];
  for (const { connection: connState, expectedText, expectedPoll, expectedPollRange, expectLoginLink } of cases) {
    const queries = [];
    const effects = [];
    const resource = {
      queries: Object.fromEntries(["connection", "reconciliation", "reconciliationLocal"].map((operation) =>
        [operation, { options: () => ({ operation }) }])),
      mutations: { refreshReconciliation: { options: () => ({}) }, submit: { options: () => ({}) } },
    };
    const jsx = (type, props) => ({ type: typeof type === "string" ? type : "component", props });
    const {
      InHouseReconciliation,
      getReconciliationConnectionPollInterval,
    } = loadModule("./components/in-house-reconciliation.tsx", {
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "@tanstack/react-query": {
        useQueryClient: () => ({}), useMutation: () => ({ isPending: false }),
        useQuery: (options) => {
          queries.push(options);
          return { isSuccess: true, isFetching: false, isError: false, isLoading: false,
            data: options.operation === "connection" ? connState : { ...response, sources: { VIETNAMESE: complete, FOREIGN: complete } } };
        },
      },
      "@tanstack/react-table": { getCoreRowModel, getFilteredRowModel,
        useReactTable: () => ({ getFilteredRowModel: () => ({ rows: [{ original: row }] }) }) },
      "react": { useMemo: (fn) => fn(), useEffect: (fn) => effects.push(fn), useId: () => "id",
        useState: (initial) => [initial, () => {}], useRef: (current) => ({ current }) },
      "vs-icon": {}, "kbtt-resource": { kbttResource: { bind: () => resource } },
      "in-house-bca-status": {}, "in-house-declaration-cells": { declarationColumnLabels: [] },
      "kbtt-declarations-page": {}, "kbtt-contract": { sanitizeErrorMessage: () => "" },
      "kbtt-auto-submit-section": { KbttAutoSubmitSection: () => null },
      "kbtt-schedule-info": { KbttScheduleInfo: () => null },
    });
    const view = InHouseReconciliation({ hotelId: "hotel-1", canManage: true });
    // The mount effect exits before scheduling a timer while not connected.
    assert.equal(effects[0](), undefined);
    const connQuery = queries.find((query) => query.operation === "connection");
    const actualPoll = connQuery.refetchInterval({ state: { data: connState } });
    if (expectedPollRange) {
      assert.equal(typeof actualPoll, "number");
      assert.ok(actualPoll >= expectedPollRange[0] && actualPoll <= expectedPollRange[1]);
    } else {
      assert.equal(actualPoll, expectedPoll);
      assert.equal(getReconciliationConnectionPollInterval(connState), expectedPoll);
    }
    assert.equal(queries.find((query) => query.operation === "reconciliation").enabled, false);
    assert.equal(queries.find((query) => query.operation === "reconciliationLocal").enabled, true);
    const rendered = JSON.stringify(view);
    assert.match(rendered, expectedText);
    assert.doesNotMatch(rendered, /Đang đối soát…/);
    assert.equal(/Kết nối tài khoản BCA/.test(rendered), expectLoginLink);
  }
});

test("in-house view exposes only two BCA labels and blocks retries when either country is incomplete", () => {
  const source = readFileSync(new URL("./components/in-house-reconciliation.tsx", import.meta.url), "utf8");
  assert.match(source, /MATCHED: \{ label: "Đã có(?: BCA)?"/);
  assert.match(source, /NOT_FOUND: \{ label: "Chưa có(?: BCA)?"/);
  assert.doesNotMatch(source, /REVIEW: \{ label:/);
  assert.match(source, /query\.data\.sources\.VIETNAMESE\.state === "COMPLETE" && query\.data\.sources\.FOREIGN\.state === "COMPLETE"/);
  assert.match(source, /row\.checkedOutAt \? "Đã trả phòng" : "Đang ở"/);
});

test("repository ensures its BCA session before full GET and refuses malformed reconciliation", async () => {
  const calls = []; let payload = { data: response };
  const contract = await import("./types/kbtt-contract.ts");
  const { kbttRepository: repository } = loadModule("./repositories/kbtt-repository.ts", {
    "internal-api-client": { requestInternalApiEnvelope: async (...args) => { calls.push(args); return args[1].method === "POST" ? { data: { ready: true } } : payload; } },
    "kbtt-contract": contract,
    "zod": zod,
  });
  const signal = new AbortController().signal;
  assert.equal((await repository.reconciliation("hotel/1", signal, true)).sources.FOREIGN.state, "NEEDS_LOGIN");
  assert.equal(calls.length, 4);
  assert.equal(calls[0][0], "/api/hotel-ops/hotels/hotel%2F1/kbtt/reconciliation/session");
  assert.deepEqual(calls[0][1], { method: "POST", signal });
  assert.equal(calls[1][0], "/api/hotel-ops/hotels/hotel%2F1/kbtt/reconciliation?force=true");
  assert.deepEqual(calls[1][1], { method: "GET", signal });
  assert.deepEqual(calls.map((call) => call[1].method), ["POST", "GET", "POST", "GET"]);
  payload = { data: { items: [] } };
  await assert.rejects(repository.reconciliation("hotel-1", signal, true));
});


test("local guest snapshot is available independently when full both-country synchronization fails", async () => {
  const local = { ...response, items: [{ ...row, status: null, canRetry: false }], checkedAt: null,
    sources: { VIETNAMESE: { state: "PENDING", checkedAt: null, error: null }, FOREIGN: { state: "PENDING", checkedAt: null, error: null } } };
  assert.equal(kbttReconciliationSchema.parse(local).items.length, 1);
  const calls = [];
  const { kbttResource: config } = loadModule("./resources/kbtt-resource.ts", {
    "query-resource": { createResource: () => (config) => config, defineQuery: (config) => config, defineMutation: (config) => config },
    "kbtt-repository": { kbttRepository: { reconciliation: async (...args) => {
      calls.push(args);
      if (args[3] === true) return local;
      throw new Error("BCA read failed");
    } } },
  });
  const signal = new AbortController().signal;
  const context = { scope: { hotelId: "hotel-1" }, signal };
  const immediate = await config.queries.reconciliationLocal.queryFn(context);
  assert.equal(immediate.items[0].status, null);
  assert.equal(immediate.sources.VIETNAMESE.state, "PENDING");
  assert.equal(immediate.sources.FOREIGN.state, "PENDING");
  await assert.rejects(config.queries.reconciliation.queryFn(context), /BCA read failed/);
  assert.deepEqual(calls, [["hotel-1", signal, false, true], ["hotel-1", signal, true]]);
  assert.equal(immediate.items[0].fullName, row.fullName);
});

test("local-only repository GET bypasses force provider reads and validates its pending DTO", async () => {
  const calls = [];
  const pending = { ...response, items: [{ ...row, status: null, canRetry: false }],
    sources: { VIETNAMESE: { state: "PENDING", checkedAt: null, error: null }, FOREIGN: { state: "PENDING", checkedAt: null, error: null } } };
  const contract = await import("./types/kbtt-contract.ts");
  const { kbttRepository: repository } = loadModule("./repositories/kbtt-repository.ts", {
    "internal-api-client": { requestInternalApiEnvelope: async (...args) => { calls.push(args); return { data: pending }; } },
    "kbtt-contract": contract,
    "zod": zod,
  });
  const result = await repository.reconciliation("hotel-1", undefined, false, true);
  assert.equal(calls[0][0], "/api/hotel-ops/hotels/hotel-1/kbtt/reconciliation?localOnly=true");
  assert.equal(calls[0][1].method, "GET");
  assert.equal(calls.length, 1);
  assert.equal(result.items[0].status, null);
});


test("failed or malformed session readiness never starts provider reconciliation GET", async () => {
  const contract = await import("./types/kbtt-contract.ts");
  for (const result of [new Error("BCA authentication failed"), { data: { ready: false } }, { data: {} }]) {
    const calls = [];
    const { kbttRepository: repository } = loadModule("./repositories/kbtt-repository.ts", {
      "internal-api-client": { requestInternalApiEnvelope: async (...args) => {
        calls.push(args);
        if (result instanceof Error) throw result;
        return result;
      } },
      "kbtt-contract": contract,
      "zod": zod,
    });
    await assert.rejects(repository.reconciliation("hotel-1", undefined, true));
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1].method, "POST");
  }
});

test("session BFF only forwards a validated scoped auth maintenance POST and returns no credentials", async () => {
  const calls = [];
  const { POST } = loadModule("../../app/api/hotel-ops/hotels/[hotelId]/kbtt/reconciliation/session/route.ts", {
    "next/server": { NextResponse: { json: (body, options) => Response.json(body, options) } },
    "zod": zod,
    "hotel-ops/_utils": {
      executeHotelOpsBackendRequest: async (_name, run) => run("local-app-token"),
      validationErrorResponse: (message) => Response.json({ message }, { status: 400 }),
      hotelOpsHttpErrorResponse: () => Response.json({}, { status: 502 }),
      unknownServerErrorResponse: () => Response.json({}, { status: 500 }),
    },
    "http-error": { HttpError: class extends Error {} },
    "http-server": { httpServer: { request: async (...args) => { calls.push(args); return { data: { ready: true, accessToken: "must-not-return" } }; } } },
  });
  const response = await POST(new Request("http://localhost"), { params: Promise.resolve({ hotelId: "hotel/1" }) });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual((await response.json()).data, { ready: true });
  assert.equal(calls[0][0], "POST");
  assert.equal(calls[0][1], "/hotels/hotel%2F1/kbtt/reconciliation/session");
  assert.equal((await POST(new Request("http://localhost"), { params: Promise.resolve({ hotelId: "" }) })).status, 400);
  assert.equal(calls.length, 1);
});


test("revoked cached BCA token is repaired once and refetches both country results", async () => {
  const contract = await import("./types/kbtt-contract.ts");
  const calls = [];
  const { kbttRepository: repository } = loadModule("./repositories/kbtt-repository.ts", {
    "internal-api-client": { requestInternalApiEnvelope: async (...args) => {
      calls.push(args);
      if (args[1].method === "POST") return { data: { ready: true } };
      return { data: calls.length === 2 ? response : { ...response, sources: { VIETNAMESE: complete, FOREIGN: complete } } };
    } },
    "kbtt-contract": contract,
    "zod": zod,
  });
  const result = await repository.reconciliation("hotel-1", undefined, true);
  assert.deepEqual(calls.map((call) => call[1].method), ["POST", "GET", "POST", "GET"]);
  assert.equal(result.sources.VIETNAMESE.state, "COMPLETE");
  assert.equal(result.sources.FOREIGN.state, "COMPLETE");
});

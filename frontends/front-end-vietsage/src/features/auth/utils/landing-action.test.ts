import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { resolveLandingAction } from "./landing-action-core.ts";

// ── No session ────────────────────────────────────────────────────

test("returns Sign in when session is null", () => {
  const action = resolveLandingAction(null, false, "/admin/dashboard");
  assert.equal(action.label, "Sign in");
  assert.equal(action.href, "/login");
});

// ── Expired / error sessions ──────────────────────────────────────

test("returns Sign in when session has authError", () => {
  const action = resolveLandingAction(
    { activeRoleCode: "SUPER_ADMIN", canRefresh: false, authError: "RefreshAccessTokenError" },
    false,
    "/admin/dashboard",
  );
  assert.equal(action.label, "Sign in");
  assert.equal(action.href, "/login");
});

test("returns Sign in when session cannot refresh", () => {
  const action = resolveLandingAction(
    { activeRoleCode: "SUPER_ADMIN", canRefresh: false, authError: null },
    false,
    "/admin/dashboard",
  );
  assert.equal(action.label, "Sign in");
  assert.equal(action.href, "/login");
});

test("returns Sign in when activeRoleCode is null", () => {
  const action = resolveLandingAction(
    { activeRoleCode: null, canRefresh: true, authError: null },
    false,
    "/admin/dashboard",
  );
  assert.equal(action.label, "Sign in");
  assert.equal(action.href, "/login");
});

// ── Authenticated admin/owner/staff ───────────────────────────────

test("returns Go to dashboard for admin session", () => {
  const action = resolveLandingAction(
    { activeRoleCode: "SUPER_ADMIN", canRefresh: true, authError: null },
    false,
    "/admin/dashboard",
  );
  assert.equal(action.label, "Go to dashboard");
  assert.equal(action.href, "/admin/dashboard");
});

test("returns Go to dashboard for owner session", () => {
  const action = resolveLandingAction(
    { activeRoleCode: "HOTEL_OWNER", canRefresh: true, authError: null },
    false,
    "/owner/dashboard",
  );
  assert.equal(action.label, "Go to dashboard");
  assert.equal(action.href, "/owner/dashboard");
});

test("returns Go to dashboard for staff session", () => {
  const action = resolveLandingAction(
    { activeRoleCode: "HOTEL_FRONTDESK", canRefresh: true, authError: null },
    false,
    "/staff",
  );
  assert.equal(action.label, "Go to dashboard");
  assert.equal(action.href, "/staff");
});

// ── Guest session ─────────────────────────────────────────────────

test("returns Open guest experience for guest session", () => {
  const action = resolveLandingAction(
    { activeRoleCode: "guest", canRefresh: true, authError: null },
    true,
    "/",
  );
  assert.equal(action.label, "Open guest experience");
  assert.equal(action.href, "/g/home");
});

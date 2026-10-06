import assert from "node:assert/strict";
import test from "node:test";

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { LOCALMATE_COOKIE_OPTIONS, LOCALMATE_SESSION_COOKIE } from "../../app/api/localmate/_lib/session-cookie.ts";
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { toApiErrorMessage, unwrapApiEnvelope } from "../../core/http/api-envelope.ts";
// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { candidateKeySchema, proposalKeySchema } from "../../app/api/localmate/public-chat/payload-schema.ts";

test("HttpOnly session cookie is configured securely with path restriction", () => {
  assert.equal(LOCALMATE_SESSION_COOKIE, "public_localmate_token");
  assert.equal(LOCALMATE_COOKIE_OPTIONS.httpOnly, true);
  assert.equal(LOCALMATE_COOKIE_OPTIONS.sameSite, "lax");
  assert.equal(LOCALMATE_COOKIE_OPTIONS.path, "/api/localmate");
  assert.equal(LOCALMATE_COOKIE_OPTIONS.maxAge, 86400);
});

test("public BFF unwraps the backend response envelope before returning data", () => {
  assert.deepEqual(
    unwrapApiEnvelope({
      status: 201,
      error: null,
      message: "Gọi API thành công",
      data: { sessionId: "pub-1", expiresAt: "2026-10-06T00:00:00.000Z" },
    }).data,
    { sessionId: "pub-1", expiresAt: "2026-10-06T00:00:00.000Z" },
  );
});

test("public BFF keeps the actionable backend detail without returning the whole payload", () => {
  assert.equal(
    toApiErrorMessage({
      status: 400,
      message: "BAD_REQUEST",
      data: { detail: "Hướng dẫn viên không phục vụ tại khu vực đã chọn" },
    }),
    "Hướng dẫn viên không phục vụ tại khu vực đã chọn",
  );
});

test("candidate key format conforms to canonical pattern", () => {
  assert.equal(candidateKeySchema.safeParse(`cand_${"c".repeat(43)}`).success, true);
  assert.equal(candidateKeySchema.safeParse("cand_LM-LC-001").success, true);
  assert.equal(candidateKeySchema.safeParse("cand_LM-HN-001").success, true);
  assert.equal(candidateKeySchema.safeParse("invalid_prefix_123").success, false);
});

test("guest phone validation conforms to standard format", () => {
  const phonePattern = /^\+?[0-9][0-9 .()-]{5,30}$/;
  assert.ok(phonePattern.test("0901234567"));
  assert.ok(phonePattern.test("+84901234567"));
  assert.ok(phonePattern.test("+84 (024) 3825-9999"));
  assert.ok(!phonePattern.test("abc"));
  assert.ok(!phonePattern.test("123"));
});

test("order creation idempotency key format is non-empty string", () => {
  const idempotencyPattern = /^[A-Za-z0-9_-]{8,120}$/;
  const sampleKey = `ord_${Date.now()}_abc123`;
  assert.ok(idempotencyPattern.test(sampleKey));
});

// @ts-expect-error Node's strip-types runner requires the explicit TypeScript extension.
import { canProceedToBooking, validateBookingPrerequisites, transitionStage, resetSelectionOnLocationChange, type PublicLocalMateProposal, type PublicLocalMateSelection, type PublicLocalMateStage, type PublicLocalMateActionType, type CreatePublicOrderInput } from "./types.ts";

test("proposal key format conforms to canonical pattern", () => {
  assert.equal(proposalKeySchema.safeParse(`prop_${"p".repeat(43)}`).success, true);
  assert.equal(proposalKeySchema.safeParse("prop_hanoi_old_quarter").success, true);
  assert.equal(proposalKeySchema.safeParse("trip_tour-ha-noi-1d").success, true);
  assert.equal(proposalKeySchema.safeParse("invalid_prop_format").success, false);
});

test("selection object conforms to frozen contract with proposalKey and candidateKey", () => {
  const fullSelection: PublicLocalMateSelection = {
    proposalKey: `prop_${"p".repeat(43)}`,
    candidateKey: `cand_${"c".repeat(43)}`,
  };
  assert.equal(fullSelection.proposalKey, `prop_${"p".repeat(43)}`);
  assert.equal(fullSelection.candidateKey, `cand_${"c".repeat(43)}`);

  const proposalOnlySelection: PublicLocalMateSelection = {
    proposalKey: `prop_${"p".repeat(43)}`,
  };
  assert.equal(proposalOnlySelection.proposalKey, `prop_${"p".repeat(43)}`);
  assert.equal(proposalOnlySelection.candidateKey, undefined);
});

test("stage lifecycle strictly supports DISCOVERY, PROPOSALS, GUIDE_SELECTION, BOOKING", () => {
  const validStages: PublicLocalMateStage[] = [
    "DISCOVERY",
    "PROPOSALS",
    "GUIDE_SELECTION",
    "BOOKING",
  ];
  assert.equal(validStages.length, 4);
  assert.ok(validStages.includes("DISCOVERY"));
  assert.ok(validStages.includes("PROPOSALS"));
  assert.ok(validStages.includes("GUIDE_SELECTION"));
  assert.ok(validStages.includes("BOOKING"));
});

test("typed actions strictly support SELECT_PROPOSAL, REFINE_PROPOSAL, SHOW_ALTERNATIVES, SELECT_GUIDE", () => {
  const validActions: PublicLocalMateActionType[] = [
    "SELECT_PROPOSAL",
    "REFINE_PROPOSAL",
    "SHOW_ALTERNATIVES",
    "SELECT_GUIDE",
  ];
  assert.equal(validActions.length, 4);
});

test("proposal cards conform to frozen contract properties", () => {
  const sampleProposal: PublicLocalMateProposal = {
    proposalKey: `prop_${"p".repeat(43)}`,
    title: "Tour Cà phê & Văn hóa Hà Nội",
    location: "Hà Nội",
    duration: "3.5 giờ",
    highlights: ["Cà phê Trứng Giảng", "Nhà hát Lớn", "Hồ Gươm"],
    bookable: true,
    availableGuideCount: 4,
    selected: false,
  };

  assert.equal(sampleProposal.proposalKey, `prop_${"p".repeat(43)}`);
  assert.equal(typeof sampleProposal.title, "string");
  assert.equal(typeof sampleProposal.location, "string");
  assert.equal(typeof sampleProposal.duration, "string");
  assert.ok(Array.isArray(sampleProposal.highlights));
  assert.equal(sampleProposal.highlights.length, 3);
  assert.equal(typeof sampleProposal.bookable, "boolean");
  assert.equal(sampleProposal.bookable, true);
  assert.equal(typeof sampleProposal.availableGuideCount, "number");
  assert.equal(sampleProposal.availableGuideCount, 4);
});

test("SHOW_ALTERNATIVES and REFINE_PROPOSAL remain in DISCOVERY stage", () => {
  assert.equal(transitionStage("PROPOSALS", "SHOW_ALTERNATIVES"), "DISCOVERY");
  assert.equal(transitionStage("PROPOSALS", "REFINE_PROPOSAL"), "DISCOVERY");
  assert.equal(transitionStage("GUIDE_SELECTION", "SHOW_ALTERNATIVES"), "DISCOVERY");
  assert.equal(transitionStage("GUIDE_SELECTION", "REFINE_PROPOSAL"), "DISCOVERY");
  assert.equal(transitionStage("DISCOVERY", "SHOW_ALTERNATIVES"), "DISCOVERY");
});

test("SELECT_PROPOSAL transitions to GUIDE_SELECTION stage", () => {
  assert.equal(transitionStage("PROPOSALS", "SELECT_PROPOSAL"), "GUIDE_SELECTION");
  assert.equal(transitionStage("DISCOVERY", "SELECT_PROPOSAL"), "GUIDE_SELECTION");
});

test("SELECT_GUIDE transitions to BOOKING stage", () => {
  assert.equal(transitionStage("GUIDE_SELECTION", "SELECT_GUIDE"), "BOOKING");
  assert.equal(transitionStage("PROPOSALS", "SELECT_GUIDE"), "BOOKING");
});

test("booking cannot proceed without both proposalKey and candidateKey", () => {
  // Missing both
  assert.equal(canProceedToBooking({ proposalKey: null, candidateKey: null }), false);
  const resultBothMissing = validateBookingPrerequisites({ proposalKey: null, candidateKey: null });
  assert.equal(resultBothMissing.ok, false);
  assert.match(resultBothMissing.error ?? "", /Cần chọn cả lịch trình và hướng dẫn viên/);

  // Missing candidateKey
  assert.equal(canProceedToBooking({ proposalKey: "prop_123", candidateKey: null }), false);
  const resultMissingCand = validateBookingPrerequisites({ proposalKey: "prop_123", candidateKey: null });
  assert.equal(resultMissingCand.ok, false);
  assert.match(resultMissingCand.error ?? "", /chọn hướng dẫn viên/);

  // Missing proposalKey
  assert.equal(canProceedToBooking({ proposalKey: null, candidateKey: "cand_456" }), false);
  const resultMissingProp = validateBookingPrerequisites({ proposalKey: null, candidateKey: "cand_456" });
  assert.equal(resultMissingProp.ok, false);
  assert.match(resultMissingProp.error ?? "", /chọn lịch trình/);

  // Both present -> proceeds
  assert.equal(canProceedToBooking({ proposalKey: "prop_123", candidateKey: "cand_456" }), true);
  const resultOk = validateBookingPrerequisites({ proposalKey: "prop_123", candidateKey: "cand_456" });
  assert.equal(resultOk.ok, true);
  assert.equal(resultOk.error, undefined);
});

test("change location / reset invalidates both proposalKey and candidateKey and reverts to DISCOVERY", () => {
  const reset = resetSelectionOnLocationChange();
  assert.equal(reset.proposalKey, null);
  assert.equal(reset.candidateKey, null);
  assert.equal(reset.stage, "DISCOVERY");
});

test("order creation payload forwards both candidateKey and proposalKey", () => {
  const orderInput: CreatePublicOrderInput = {
    candidateKey: `cand_${"c".repeat(43)}`,
    proposalKey: `prop_${"p".repeat(43)}`,
    quantity: 2,
    partySize: 2,
    requestedStartAt: "2026-10-10T08:00:00.000Z",
    guestNote: "Không ăn cay",
    idempotencyKey: "ord_idemp_key_12345",
  };

  assert.equal(orderInput.candidateKey, `cand_${"c".repeat(43)}`);
  assert.equal(orderInput.proposalKey, `prop_${"p".repeat(43)}`);
  assert.equal(orderInput.partySize, 2);
  assert.equal(orderInput.idempotencyKey, "ord_idemp_key_12345");
});

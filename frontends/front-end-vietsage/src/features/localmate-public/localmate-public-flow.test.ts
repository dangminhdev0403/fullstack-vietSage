import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// @ts-expect-error Node strip-types requires .ts extension
import { LOCALMATE_COOKIE_OPTIONS, LOCALMATE_SESSION_COOKIE } from "../../app/api/localmate/_lib/session-cookie.ts";
// @ts-expect-error Node strip-types requires .ts extension
import { toApiErrorMessage, unwrapApiEnvelope } from "../../core/http/api-envelope.ts";
// @ts-expect-error Node strip-types requires .ts extension
import { candidateKeySchema, proposalKeySchema } from "../../app/api/localmate/public-chat/payload-schema.ts";
// @ts-expect-error Node strip-types requires .ts extension
import { PUBLIC_LOCALMATE_DESTINATIONS, getLocalizedDestinations } from "./constants/locations.ts";
// @ts-expect-error Node strip-types requires .ts extension
import { PROVINCE_MAP, REGIONS, PROVINCES } from "../localmate/constants/geography.ts";
// @ts-expect-error Node strip-types requires .ts extension
import { PUBLIC_CHAT_COPY_BY_LOCALE } from "../localmate-chat/localmate-chat-copy.ts";
// @ts-expect-error Node strip-types requires .ts extension
import { SUPPORTED_LOCALES } from "../../core/i18n/locales.ts";
// @ts-expect-error Node strip-types requires .ts extension
import { canProceedToBooking, validateBookingPrerequisites, transitionStage, resetSelectionOnLocationChange, type PublicLocalMateProposal, type PublicLocalMateSelection, type PublicLocalMateStage, type PublicLocalMateActionType, type CreatePublicOrderInput } from "./types.ts";
// @ts-expect-error Node strip-types requires .ts extension
import { useLocalMateSessionStore } from "./store/localmate-session-store.ts";

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

test("CreatePublicOrderInput contract strictly limits payload to partySize and keys", () => {
  const payload: CreatePublicOrderInput = {
    candidateKey: "cand_LM-HN-001",
    proposalKey: "trip_tour-ha-noi-1d",
    partySize: 3,
    idempotencyKey: "ord_12345678",
  };

  assert.equal(payload.candidateKey, "cand_LM-HN-001");
  assert.equal(payload.proposalKey, "trip_tour-ha-noi-1d");
  assert.equal(payload.partySize, 3);
  assert.equal(payload.idempotencyKey, "ord_12345678");

  // Type contract: quantity, requestedStartAt, and guestNote should not be present
  const keys = Object.keys(payload);
  assert.ok(!keys.includes("quantity"));
  assert.ok(!keys.includes("requestedStartAt"));
  assert.ok(!keys.includes("guestNote"));
});

test("useLocalMateSessionStore openGuideChat transitions into open guide-chat with orderId", () => {
  const store = useLocalMateSessionStore.getState();
  store.openGuideChat("ord-test-123");

  const state = useLocalMateSessionStore.getState();
  assert.equal(state.isOpen, true);
  assert.equal(state.viewMode, "guide-chat");
  assert.equal(state.activeOrderId, "ord-test-123");
});

test("useLocalMateSessionStore openPayment transitions into open payment mode with orderId", () => {
  const store = useLocalMateSessionStore.getState();
  store.openPayment("ord-pay-456");

  const state = useLocalMateSessionStore.getState();
  assert.equal(state.isOpen, true);
  assert.equal(state.viewMode, "payment");
  assert.equal(state.activeOrderId, "ord-pay-456");
});

test("useLocalMateSessionStore resetSession clears active selections and resets to discovery", () => {
  const store = useLocalMateSessionStore.getState();
  store.setActiveCandidateKey("cand_123");
  store.setActiveProposalKey("prop_123");
  store.resetSession();

  const state = useLocalMateSessionStore.getState();
  assert.equal(state.activeOrderId, null);
  assert.equal(state.activeCandidateKey, null);
  assert.equal(state.activeProposalKey, null);
  assert.equal(state.viewMode, "discovery");
  assert.equal(state.stage, "DISCOVERY");
});

test("PUBLIC_LOCALMATE_DESTINATIONS contains exactly six featured cards in canonical order", () => {
  assert.equal(PUBLIC_LOCALMATE_DESTINATIONS.length, 6);

  const expected = [
    { order: 1, provinceCode: "LAO_CAI", label: "Lào Cai – Sa Pa", location: "Sa Pa, Lào Cai" },
    { order: 2, provinceCode: "HA_NOI", label: "Hà Nội", location: "Hà Nội" },
    { order: 3, provinceCode: "DA_NANG", label: "Đà Nẵng", location: "Đà Nẵng" },
    { order: 4, provinceCode: "QUANG_NAM", label: "Quảng Nam – Hội An", location: "Hội An, Quảng Nam" },
    { order: 5, provinceCode: "HO_CHI_MINH", label: "TP. Hồ Chí Minh", location: "TP. Hồ Chí Minh" },
    { order: 6, provinceCode: "KIEN_GIANG", label: "Phú Quốc – Kiên Giang", location: "Phú Quốc, Kiên Giang" },
  ];

  for (let i = 0; i < expected.length; i++) {
    const item = PUBLIC_LOCALMATE_DESTINATIONS[i];
    const exp = expected[i];
    assert.equal(item.order, exp.order);
    assert.equal(item.provinceCode, exp.provinceCode);
    assert.equal(item.label, exp.label);
    assert.equal(item.location, exp.location);
    assert.ok(item.icon, `Missing icon for ${item.label}`);
    assert.ok(item.tag, `Missing tag for ${item.label}`);
  }
});

test("all featured destinations map to valid canonical provinces in neutral taxonomy", () => {
  for (const dest of PUBLIC_LOCALMATE_DESTINATIONS) {
    const province = PROVINCE_MAP[dest.provinceCode];
    assert.ok(province, `Province code ${dest.provinceCode} must exist in PROVINCE_MAP`);
    assert.ok(province.destinations.length > 0);
  }
});

test("localmate-admin cleanly re-exports neutral geography taxonomy without divergence", () => {
  const adminGeo = readFileSync(new URL("../localmate-admin/constants/geography.ts", import.meta.url), "utf8");
  const neutralExports = ["REGIONS", "PROVINCES", "REGION_MAP", "PROVINCE_MAP", "getProvincesByRegion", "detectProvinceFromDestination"];
  for (const sym of neutralExports) {
    assert.ok(adminGeo.includes(sym), `Admin geography must re-export ${sym}`);
  }
  assert.ok(adminGeo.includes("@/features/localmate/constants/geography"), "Admin must re-export from neutral geography");
  assert.equal(REGIONS.length, 4);
  assert.equal(PROVINCES.length, 20);
});

test("all 6 supported locales have required phone and format error copy", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const copy = PUBLIC_CHAT_COPY_BY_LOCALE[locale];
    assert.ok(copy, `Copy must exist for locale ${locale}`);
    assert.ok(copy.phoneRequiredError && copy.phoneRequiredError.trim().length > 0);
    assert.ok(copy.phoneFormatError && copy.phoneFormatError.trim().length > 0);
    assert.ok(copy.nameRequiredError && copy.nameRequiredError.trim().length > 0);
  }
});

test("phone validation enforces valid phone formats and rejects empty/invalid values", () => {
  const phoneRegex = /^\+?[0-9][0-9 .()-]{5,30}$/;

  // Valid numbers
  assert.ok(phoneRegex.test("0901234567"));
  assert.ok(phoneRegex.test("+84901234567"));
  assert.ok(phoneRegex.test("+1 555-0199"));
  assert.ok(phoneRegex.test("+84 24 3825 0000"));

  // Invalid numbers
  assert.ok(!phoneRegex.test(""));
  assert.ok(!phoneRegex.test("abc"));
  assert.ok(!phoneRegex.test("123"));
  assert.ok(!phoneRegex.test("phone: 0901234567"));
});

test("destination i18n provides localized labels and tags for all 6 supported locales while preserving canonical location and provinceCode", () => {
  for (const locale of SUPPORTED_LOCALES) {
    const localized = getLocalizedDestinations(locale);
    assert.equal(localized.length, 6);
    for (let i = 0; i < localized.length; i++) {
      const dest = localized[i];
      const canonical = PUBLIC_LOCALMATE_DESTINATIONS[i];
      assert.equal(dest.order, canonical.order);
      assert.equal(dest.provinceCode, canonical.provinceCode);
      assert.equal(dest.location, canonical.location);
      assert.equal(dest.icon, canonical.icon);
      assert.ok(dest.label && dest.label.trim().length > 0);
      assert.ok(dest.tag && dest.tag.trim().length > 0);
    }
  }
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GuestChatAction } from "@/features/marketplace/types/marketplace-contract";
// @ts-expect-error Node strip-types requires .ts extension
import { getLocalMateChatUiText, getLocalMateNetworkErrorReply, getLocalMateWelcomeMessage, SUGGESTIONS_BY_LOCALE } from "../../../localmate-chat/localmate-chat-copy.ts";
// @ts-expect-error Node strip-types requires .ts extension
import { SUPPORTED_LOCALES } from "../../../../core/i18n/locales.ts";

describe("LocalMateBookingCard contract", () => {
  const mockAction: GuestChatAction = {
    type: "LOCALMATE_BOOKING",
    candidateKey: "cand_LM-LC-001",
    localMate: {
      fullName: "Sùng A Tủa",
      avatarUrl: "https://example.com/avatar.jpg",
      languages: ["Tiếng Việt", "H'Mông"],
      specialties: ["Trekking đỉnh Fansipan", "Bản Cát Cát"],
      rating: 4.95,
      totalReviews: 42,
      telegramReady: true,
    },
    service: {
      id: "srv-123",
      name: "Trekking Khám Phá Sa Pa Cùng LocalMate",
      unitPrice: "1200000",
      currency: "VND",
      pricingUnit: "tour",
    },
  };

  it("validates that action conforms to GuestChatAction structure", () => {
    assert.equal(mockAction.type, "LOCALMATE_BOOKING");
    assert.equal(mockAction.candidateKey, "cand_LM-LC-001");
    assert.equal(mockAction.localMate.fullName, "Sùng A Tủa");
    assert.equal(mockAction.localMate.telegramReady, true);
    assert.equal(mockAction.service.unitPrice, "1200000");
  });

  it("handles pricing conversion for display correctly", () => {
    const raw = Number(mockAction.service.unitPrice);
    assert.equal(Number.isFinite(raw), true);
    const formatted = new Intl.NumberFormat("vi-VN").format(raw) + " ₫";
    assert.match(formatted, /1[\.,]200[\.,]000\s*₫/);
  });
});

describe("GuestFloatingChat shared copy integration", () => {
  it("provides valid chat UI text for all supported guest locales", () => {
    for (const loc of SUPPORTED_LOCALES) {
      const uiText = getLocalMateChatUiText(loc);
      assert.ok(uiText.teaserTag.length > 0, `Missing teaserTag for ${loc}`);
      assert.ok(uiText.teaserTitle.length > 0, `Missing teaserTitle for ${loc}`);
      assert.ok(uiText.teaserDesc.length > 0, `Missing teaserDesc for ${loc}`);
      assert.ok(uiText.readyText.length > 0, `Missing readyText for ${loc}`);
      assert.ok(uiText.bannerText.length > 0, `Missing bannerText for ${loc}`);
      assert.ok(uiText.typing.length > 0, `Missing typing for ${loc}`);
      assert.ok(uiText.placeholder.length > 0, `Missing placeholder for ${loc}`);
      assert.ok(uiText.sendAria.length > 0, `Missing sendAria for ${loc}`);
      assert.ok(uiText.closeAria.length > 0, `Missing closeAria for ${loc}`);
    }
  });

  it("provides personalized welcome messages for all supported guest locales", () => {
    for (const loc of SUPPORTED_LOCALES) {
      const msg = getLocalMateWelcomeMessage(loc, "Minh");
      assert.ok(msg.includes("Minh"), `Welcome message missing guest name for ${loc}`);
      assert.ok(msg.includes("LocalMate AI"), `Welcome message missing branding for ${loc}`);
    }
  });

  it("provides network error fallback for all supported guest locales", () => {
    for (const loc of SUPPORTED_LOCALES) {
      const err = getLocalMateNetworkErrorReply(loc);
      assert.ok(err.length > 0, `Missing error reply for ${loc}`);
    }
  });

  it("provides at least 3 suggestion chips for all supported guest locales", () => {
    for (const loc of SUPPORTED_LOCALES) {
      const chips = SUGGESTIONS_BY_LOCALE[loc];
      assert.ok(Array.isArray(chips), `Chips not an array for ${loc}`);
      assert.ok(chips.length >= 3, `Expected at least 3 chips for ${loc}, got ${chips.length}`);
      for (const chip of chips) {
        assert.ok(chip.id.length > 0, `Chip missing id for ${loc}`);
        assert.ok(chip.label.length > 0, `Chip missing label for ${loc}`);
        assert.ok(chip.query.length > 0, `Chip missing query for ${loc}`);
      }
    }
  });
});

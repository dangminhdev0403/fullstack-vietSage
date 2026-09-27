import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { GuestChatAction } from "@/features/marketplace/types/marketplace-contract";

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

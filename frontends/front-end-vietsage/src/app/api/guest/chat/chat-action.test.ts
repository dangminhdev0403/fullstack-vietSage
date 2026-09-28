import { describe, it, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveChatAction } from "./chat-action";

describe("resolveChatAction", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.LOCALMATE_KNOWLEDGE_API_KEY;
    delete process.env.VIETSAGE_KNOWLEDGE_API_KEY;
  });

  it("returns null for null, undefined, or empty action", async () => {
    assert.equal(await resolveChatAction(null, "hotel-123"), null);
    assert.equal(await resolveChatAction(undefined, "hotel-123"), null);
    assert.equal(await resolveChatAction({}, "hotel-123"), null);
  });

  it("returns null for non-LOCALMATE_BOOKING action type", async () => {
    assert.equal(
      await resolveChatAction(
        { type: "OTHER_ACTION", candidateKey: "cand_123" },
        "hotel-123",
      ),
      null,
    );
  });

  it("returns null when backend responds with 404 or 400", async () => {
    global.fetch = async () =>
      ({
        ok: false,
        status: 404,
        json: async () => ({ status: 404, message: "Not found" }),
      }) as unknown as Response;

    const result = await resolveChatAction(
      { type: "LOCALMATE_BOOKING", candidateKey: "cand_LM-001" },
      "hotel-123",
      { backendBaseUrl: "http://localhost:8080" },
    );

    assert.equal(result, null);
  });

  it("returns null when network throws", async () => {
    global.fetch = async () => {
      throw new Error("Network timeout");
    };

    const result = await resolveChatAction(
      { type: "LOCALMATE_BOOKING", candidateKey: "cand_LM-001" },
      "hotel-123",
      { backendBaseUrl: "http://localhost:8080" },
    );

    assert.equal(result, null);
  });

  it("returns structured GuestChatAction when backend resolves candidate", async () => {
    let capturedUrl = "";
    let capturedHeaders: Record<string, string> = {};

    global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return {
        ok: true,
        status: 200,
        json: async () => ({
          status: 200,
          data: {
            candidateKey: "cand_LM-LC-001",
            guide: {
              id: "guide-1",
              guideCode: "LM-LC-001",
              fullName: "Sùng A Tủa",
              avatarUrl: "https://example.com/avatar.jpg",
              languages: ["Tiếng Việt", "H'Mông"],
              specialties: ["Trekking", "Bản địa"],
              rating: 4.9,
              totalReviews: 32,
            },
            service: {
              id: "srv-1",
              code: "TOUR_SAPA",
              name: "Tour Trekking Sa Pa",
              price: 1200000,
              currency: "VND",
              unit: "tour",
            },
            hotel: {
              id: "hotel-123",
              name: "Sapa Horizon Hotel",
              province: "Lào Cai",
            },
            telegramReady: true,
            action: "LOCALMATE_BOOKING",
          },
        }),
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const result = await resolveChatAction(
      { type: "LOCALMATE_BOOKING", candidateKey: "cand_LM-LC-001" },
      "hotel-123",
      {
        backendBaseUrl: "http://localhost:8080",
        knowledgeApiKey: "test-knowledge-key",
      },
    );

    assert.deepEqual(result, {
      type: "LOCALMATE_BOOKING",
      candidateKey: "cand_LM-LC-001",
      localMate: {
        fullName: "Sùng A Tủa",
        avatarUrl: "https://example.com/avatar.jpg",
        languages: ["Tiếng Việt", "H'Mông"],
        specialties: ["Trekking", "Bản địa"],
        rating: 4.9,
        totalReviews: 32,
        telegramReady: true,
      },
      service: {
        id: "srv-1",
        name: "Tour Trekking Sa Pa",
        unitPrice: "1200000",
        currency: "VND",
        pricingUnit: "tour",
      },
    });

    assert.equal(
      capturedUrl,
      "http://localhost:8080/localmate/booking-candidate/cand_LM-LC-001?hotelId=hotel-123",
    );
    assert.equal(capturedHeaders["X-VietSage-Knowledge-Key"], "test-knowledge-key");
  });
});

import { publicMatcher } from "./routes.config";

describe("public route configuration", () => {
  it("allows only inventoried guest-session routes without JWT", () => {
    const guestRoutes = [
      "/guest/qr/scan",
      "/guest/session/me",
      "/guest/services",
      "/guest/service-categories/category-id/services",
      "/guest/requests",
      "/guest/requests/request-id/cancel",
      "/guest/messages",
      "/guest/messages/read",
      "/guest/session/close",
      "/guest/marketplace/categories",
      "/guest/marketplace/services",
      "/guest/marketplace/services/service-1",
      "/guest/marketplace/cart",
      "/guest/marketplace/cart/items",
      "/guest/marketplace/cart/items/item-1",
      "/guest/marketplace/cart/checkout",
      "/guest/marketplace/checkout",
      "/guest/marketplace/orders",
      "/guest/marketplace/orders/order-1",
      "/emergency/guest/calls",
    ];

    for (const route of guestRoutes) {
      expect(publicMatcher.isPublic(route)).toBe(true);
    }

    expect(publicMatcher.isPublic("/guest/admin")).toBe(false);
    expect(publicMatcher.isPublic("/guest/requests/request-id/unknown")).toBe(false);
    expect(publicMatcher.isPublic("/guest/marketplace/cart/unknown/extra")).toBe(false);
    expect(publicMatcher.isPublic("/emergency/guest/admin")).toBe(false);
  });

  it("allows only inventoried provider webhook routes without JWT", () => {
    expect(publicMatcher.isPublic("/payments/webhook/MOMO")).toBe(true);
    expect(publicMatcher.isPublic("/payments/webhook/VNPAY")).toBe(true);
    expect(publicMatcher.isPublic("/webhooks/stripe")).toBe(true);
    expect(publicMatcher.isPublic("/integrations/telegram/webhook")).toBe(true);
    expect(publicMatcher.isPublic("/integrations/telegram")).toBe(false);
    expect(publicMatcher.isPublic("/payments/webhook")).toBe(false);
    expect(publicMatcher.isPublic("/payments/webhook/MOMO/extra")).toBe(false);
    expect(publicMatcher.isPublic("/webhooks/stripe/extra")).toBe(false);
    expect(publicMatcher.isPublic("/payments/other/MOMO")).toBe(false);
  });

  it("allows localmate routes configured for public bypass", () => {
    expect(publicMatcher.isPublic("/localmate/knowledge")).toBe(true);
    expect(publicMatcher.isPublic("/localmate/tours")).toBe(true);
    expect(publicMatcher.isPublic("/localmate/guides/LM-001")).toBe(true);
    expect(publicMatcher.isPublic("/localmate/ai/match")).toBe(true);
    expect(publicMatcher.isPublic("/localmate/knowledge/extra")).toBe(false);
    expect(publicMatcher.isPublic("/localmate/tours/extra")).toBe(false);
    expect(publicMatcher.isPublic("/localmate/guides")).toBe(false);
  });

  it("forbids simulate-payment and allows only legitimate public localmate order routes", () => {
    expect(publicMatcher.isPublic("/public/localmate/orders/order-1/simulate-payment")).toBe(false);
    expect(publicMatcher.isPublic("/public/localmate/orders/order-1/payment-session")).toBe(true);
    expect(publicMatcher.isPublic("/public/localmate/orders/order-1")).toBe(true);
    expect(publicMatcher.isPublic("/public/localmate/orders/order-1/conversation")).toBe(true);
    expect(publicMatcher.isPublic("/public/localmate/orders/order-1/conversation/messages")).toBe(
      true,
    );
  });
});

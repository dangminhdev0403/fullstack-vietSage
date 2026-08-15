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

  it("allows only the provider-scoped payment webhook route without JWT", () => {
    expect(publicMatcher.isPublic("/payments/webhook/MOMO")).toBe(true);
    expect(publicMatcher.isPublic("/payments/webhook/VNPAY")).toBe(true);
    expect(publicMatcher.isPublic("/payments/webhook")).toBe(false);
    expect(publicMatcher.isPublic("/payments/webhook/MOMO/extra")).toBe(false);
    expect(publicMatcher.isPublic("/payments/other/MOMO")).toBe(false);
  });
});

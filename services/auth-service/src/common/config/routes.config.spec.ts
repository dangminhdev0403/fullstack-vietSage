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
      "/emergency/guest/calls",
    ];

    for (const route of guestRoutes) {
      expect(publicMatcher.isPublic(route)).toBe(true);
    }

    expect(publicMatcher.isPublic("/guest/admin")).toBe(false);
    expect(publicMatcher.isPublic("/guest/requests/request-id/unknown")).toBe(false);
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

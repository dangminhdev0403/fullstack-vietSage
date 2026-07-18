import { publicMatcher } from "./routes.config";

describe("public route configuration", () => {
  it("allows only the provider-scoped payment webhook route without JWT", () => {
    expect(publicMatcher.isPublic("/payments/webhook/MOMO")).toBe(true);
    expect(publicMatcher.isPublic("/payments/webhook/VNPAY")).toBe(true);
    expect(publicMatcher.isPublic("/payments/webhook")).toBe(false);
    expect(publicMatcher.isPublic("/payments/webhook/MOMO/extra")).toBe(false);
    expect(publicMatcher.isPublic("/payments/other/MOMO")).toBe(false);
  });
});

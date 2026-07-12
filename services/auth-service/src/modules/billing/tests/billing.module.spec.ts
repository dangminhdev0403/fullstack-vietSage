import { existsSync } from "node:fs";
import { join } from "node:path";

describe("Billing bounded context", () => {
  const billingRoot = join(__dirname, "..");

  it("uses api/application/domain/infrastructure folders instead of a flat module", () => {
    expect(existsSync(join(billingRoot, "api", "folio.controller.ts"))).toBe(true);
    expect(existsSync(join(billingRoot, "api", "invoice.controller.ts"))).toBe(true);
    expect(existsSync(join(billingRoot, "api", "payment.controller.ts"))).toBe(true);
    expect(existsSync(join(billingRoot, "application", "billing.service.ts"))).toBe(true);
    expect(
      existsSync(join(billingRoot, "infrastructure", "repositories", "billing.repository.ts")),
    ).toBe(true);
    expect(existsSync(join(billingRoot, "domain", "schemas", "billing.schema.ts"))).toBe(true);
    expect(existsSync(join(billingRoot, "billing.service.ts"))).toBe(false);
    expect(existsSync(join(billingRoot, "billing.repository.ts"))).toBe(false);
    expect(existsSync(join(billingRoot, "folio.controller.ts"))).toBe(false);
  });
});

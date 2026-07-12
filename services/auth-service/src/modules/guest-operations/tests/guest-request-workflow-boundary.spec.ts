import { existsSync } from "node:fs";
import { join } from "node:path";

describe("Guest request workflow boundary", () => {
  const modulesRoot = join(__dirname, "..", "..");

  it("keeps staff-side request workflow in Guest Operations, not Property", () => {
    expect(
      existsSync(join(modulesRoot, "guest-operations", "api", "hotel-requests.controller.ts")),
    ).toBe(true);
    expect(
      existsSync(join(modulesRoot, "guest-operations", "application", "hotel-requests.service.ts")),
    ).toBe(true);
    expect(
      existsSync(
        join(
          modulesRoot,
          "guest-operations",
          "infrastructure",
          "repositories",
          "hotel-requests.repository.ts",
        ),
      ),
    ).toBe(true);
    expect(existsSync(join(modulesRoot, "property", "api", "hotel-requests.controller.ts"))).toBe(
      false,
    );
    expect(
      existsSync(join(modulesRoot, "property", "application", "hotel-requests.service.ts")),
    ).toBe(false);
    expect(
      existsSync(
        join(
          modulesRoot,
          "property",
          "infrastructure",
          "repositories",
          "hotel-requests.repository.ts",
        ),
      ),
    ).toBe(false);
  });
});

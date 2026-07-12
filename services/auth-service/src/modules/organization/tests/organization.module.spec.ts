import { existsSync } from "node:fs";
import { join } from "node:path";

describe("Organization bounded context", () => {
  const modulesRoot = join(__dirname, "..", "..");

  it("owns tenant-owner management without reintroducing the legacy tenant-owners module", () => {
    expect(existsSync(join(modulesRoot, "organization", "organization.module.ts"))).toBe(true);
    expect(
      existsSync(join(modulesRoot, "organization", "api", "tenant-owners.controller.ts")),
    ).toBe(true);
    expect(
      existsSync(join(modulesRoot, "organization", "application", "tenant-owners.service.ts")),
    ).toBe(true);
    expect(
      existsSync(
        join(
          modulesRoot,
          "organization",
          "infrastructure",
          "repositories",
          "tenant-owners.repository.ts",
        ),
      ),
    ).toBe(true);
    expect(existsSync(join(modulesRoot, "tenant-owners"))).toBe(false);
  });
});

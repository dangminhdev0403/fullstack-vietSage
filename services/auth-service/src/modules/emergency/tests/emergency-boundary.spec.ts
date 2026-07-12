import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

function collectTsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      return collectTsFiles(path);
    }

    return entry.isFile() && path.endsWith(".ts") ? [path] : [];
  });
}

describe("Emergency bounded context structure", () => {
  const emergencyRoot = join(__dirname, "..");

  it("uses api/application/domain/infrastructure/tests folders instead of flat files", () => {
    expect(existsSync(join(emergencyRoot, "api", "emergency.controller.ts"))).toBe(true);
    expect(existsSync(join(emergencyRoot, "application", "emergency.service.ts"))).toBe(true);
    expect(existsSync(join(emergencyRoot, "domain", "schemas", "emergency.schema.ts"))).toBe(true);
    expect(
      existsSync(join(emergencyRoot, "infrastructure", "repositories", "emergency.repository.ts")),
    ).toBe(true);

    expect(existsSync(join(emergencyRoot, "emergency.controller.ts"))).toBe(false);
    expect(existsSync(join(emergencyRoot, "emergency.service.ts"))).toBe(false);
    expect(existsSync(join(emergencyRoot, "emergency.repository.ts"))).toBe(false);
    expect(existsSync(join(emergencyRoot, "schemas", "emergency.schema.ts"))).toBe(false);
  });

  it("does not query guest-session persistence directly inside Emergency", () => {
    const offenders = collectTsFiles(emergencyRoot)
      .filter((path) => !path.endsWith("emergency-boundary.spec.ts"))
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        return /prisma\.guestSession/.test(source) ? [relative(emergencyRoot, path)] : [];
      });

    expect(offenders).toEqual([]);
  });

  it("does not import Guest Operations implementation internals", () => {
    const offenders = collectTsFiles(emergencyRoot)
      .filter((path) => !path.endsWith("emergency-boundary.spec.ts"))
      .flatMap((path) => {
        const source = readFileSync(path, "utf8");
        return /\.\.\/guest-operations\/(application|infrastructure)|\.\.\/\.\.\/guest-operations\/(application|infrastructure)/.test(
          source,
        )
          ? [relative(emergencyRoot, path)]
          : [];
      });

    expect(offenders).toEqual([]);
  });
});

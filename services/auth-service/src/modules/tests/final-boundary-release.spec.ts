import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const srcRoot = join(__dirname, "..", "..");
const modulesRoot = join(srcRoot, "modules");

const legacyModuleFolders = [
  "auth",
  "rbac",
  "hotel-users",
  "hotels",
  "guest-os",
  "tenant-owners",
  "telegram",
];

const boundedContexts = [
  "identity",
  "organization",
  "property",
  "guest-operations",
  "billing",
  "emergency",
  "notifications",
];

function collectFiles(dir: string, predicate: (path: string) => boolean): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);

    if (entry.isDirectory()) {
      return collectFiles(path, predicate);
    }

    return entry.isFile() && predicate(path) ? [path] : [];
  });
}

function readTsFiles(options: { includeTests?: boolean } = {}) {
  return collectFiles(srcRoot, (path) => path.endsWith(".ts"))
    .map((path) => ({
      path,
      rel: relative(srcRoot, path).replaceAll("\\", "/"),
      source: readFileSync(path, "utf8"),
    }))
    .filter(({ rel }) => options.includeTests || !rel.includes("/tests/"));
}

describe("final bounded-context release guard", () => {
  it("does not reintroduce legacy module folders", () => {
    const existingLegacyFolders = legacyModuleFolders.filter((folder) =>
      existsSync(join(modulesRoot, folder)),
    );

    expect(existingLegacyFolders).toEqual([]);
  });

  it("keeps repository classes private to module internals", () => {
    const moduleFilesWithRepositoryExports = collectFiles(modulesRoot, (path) =>
      path.endsWith(".module.ts"),
    )
      .filter((path) =>
        /exports\s*:\s*\[[\s\S]*Repository[\s\S]*\]/m.test(readFileSync(path, "utf8")),
      )
      .map((path) => relative(srcRoot, path).replaceAll("\\", "/"));

    expect(moduleFilesWithRepositoryExports).toEqual([]);
  });

  it("does not reintroduce URL-path webhook secrets", () => {
    const offenders = readTsFiles()
      .filter(({ source }) => /webhook\/:secret|@Param\(["']secret["']\)/.test(source))
      .map(({ rel }) => rel);

    expect(offenders).toEqual([]);
  });

  it("keeps Emergency from reading guest-session persistence directly", () => {
    const offenders = readTsFiles()
      .filter(({ rel }) => rel.startsWith("modules/emergency/"))
      .filter(({ source }) => /prisma\.guestSession/.test(source))
      .map(({ rel }) => rel);

    expect(offenders).toEqual([]);
  });

  it("uses public barrels instead of production imports from other bounded-context internals", () => {
    const offenders = readTsFiles().flatMap(({ rel, source }) => {
      const currentContext = boundedContexts.find((context) =>
        rel.startsWith(`modules/${context}/`),
      );

      if (!currentContext) {
        return [];
      }

      const badImports = boundedContexts
        .filter((context) => context !== currentContext)
        .filter((context) => {
          const directImplementationImport = new RegExp(
            `from ["'][^"']*${context}/(api|application|domain|infrastructure)(/|["'])`,
          );
          return directImplementationImport.test(source);
        });

      return badImports.length > 0 ? [`${rel} -> ${badImports.join(",")}`] : [];
    });

    expect(offenders).toEqual([]);
  });
});

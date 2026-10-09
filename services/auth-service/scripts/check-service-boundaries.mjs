import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.resolve(scriptDir, "../src");
const modulesRoot = path.join(sourceRoot, "modules");
const sourceExtensions = new Set([".ts", ".tsx"]);

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "tests" || entry.name === "node_modules") return [];
        return collectSourceFiles(absolutePath);
      }
      if (!sourceExtensions.has(path.extname(entry.name))) return [];
      return /\.(?:spec|test)\.tsx?$/.test(entry.name) ? [] : [absolutePath];
    }),
  );
  return nested.flat();
}

function moduleOwner(filePath) {
  const relative = path.relative(modulesRoot, filePath);
  if (relative.startsWith("..")) return null;
  return relative.split(path.sep)[0] ?? null;
}

function resolveLocalImport(sourceFile, specifier) {
  if (!specifier.startsWith(".")) return null;
  return path.resolve(path.dirname(sourceFile), specifier);
}

function isPublicModuleTarget(targetPath, owner) {
  const normalized = targetPath.replaceAll("\\", "/");
  return (
    normalized.endsWith(`/modules/${owner}/${owner}-public`) ||
    normalized.endsWith(`/modules/${owner}/${owner}.module`)
  );
}

function findImportSpecifiers(source) {
  const specifiers = [];
  const pattern = /(?:from\s+|import\s*)["']([^"']+)["']/g;
  for (const match of source.matchAll(pattern)) specifiers.push(match[1]);
  return specifiers;
}

async function checkBoundaries() {
  const files = await collectSourceFiles(sourceRoot);
  const violations = [];
  const moduleEdges = new Map();

  for (const sourceFile of files) {
    const source = await readFile(sourceFile, "utf8");
    const consumer = moduleOwner(sourceFile);

    for (const specifier of findImportSpecifiers(source)) {
      const targetPath = resolveLocalImport(sourceFile, specifier);
      if (!targetPath) continue;
      const owner = moduleOwner(targetPath);
      if (!owner || owner === consumer) continue;
      if (sourceFile.endsWith(".module.ts")) {
        if (!moduleEdges.has(consumer)) moduleEdges.set(consumer, new Set());
        moduleEdges.get(consumer).add(owner);
      }
      if (!isPublicModuleTarget(targetPath, owner)) {
        violations.push(
          `${path.relative(process.cwd(), sourceFile)} imports private ${owner} path: ${specifier}`,
        );
      }
    }

    if (sourceFile.endsWith(".module.ts") && /exports\s*:\s*\[[^\]]*Repository/s.test(source)) {
      violations.push(
        `${path.relative(process.cwd(), sourceFile)} exports a repository from its module boundary`,
      );
    }
  }

  const visiting = new Set();
  const visited = new Set();
  const stack = [];
  function visit(owner) {
    if (visiting.has(owner)) {
      return [...stack.slice(stack.indexOf(owner)), owner];
    }
    if (visited.has(owner)) return null;
    visiting.add(owner);
    stack.push(owner);
    for (const dependency of moduleEdges.get(owner) ?? []) {
      const cycle = visit(dependency);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(owner);
    visited.add(owner);
    return null;
  }
  for (const owner of moduleEdges.keys()) {
    const cycle = visit(owner);
    if (cycle) {
      violations.push(`production module dependency cycle: ${cycle.join(" -> ")}`);
      break;
    }
  }

  if (violations.length > 0) {
    console.error("Service boundary violations:\n");
    for (const violation of violations) console.error(`- ${violation}`);
    process.exitCode = 1;
    return;
  }

  console.log(`PASS service boundaries (${files.length} production source files checked)`);
}

await checkBoundaries();

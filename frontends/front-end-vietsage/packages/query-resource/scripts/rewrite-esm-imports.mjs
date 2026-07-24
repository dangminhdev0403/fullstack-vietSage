import { readdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const distDirectory = fileURLToPath(new URL("../dist", import.meta.url));
const relativeSpecifierPattern =
  /(\bfrom\s+|\bimport\s*\(\s*|\bimport\s+)(["'])(\.{1,2}\/[^"'?#]+)\2/g;

async function listModuleFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name);

      return entry.isDirectory() ? listModuleFiles(path) : [path];
    }),
  );

  return nestedFiles
    .flat()
    .filter(
      (path) => extname(path) === ".js" || path.endsWith(".d.ts"),
    );
}

function hasFileExtension(specifier) {
  return extname(specifier) !== "";
}

for (const path of await listModuleFiles(distDirectory)) {
  const source = await readFile(path, "utf8");
  const rewritten = source.replace(
    relativeSpecifierPattern,
    (match, prefix, quote, specifier) =>
      hasFileExtension(specifier)
        ? match
        : `${prefix}${quote}${specifier}.js${quote}`,
  );

  if (rewritten !== source) {
    await writeFile(path, rewritten);
  }
}

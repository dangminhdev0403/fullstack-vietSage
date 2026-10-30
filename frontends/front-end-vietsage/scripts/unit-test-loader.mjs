import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

function resolveFile(base) {
  return [base, ...[".ts", ".tsx", ".mjs", ".js"].map((ext) => base + ext),
    ...["index.ts", "index.mjs", "index.js"].map((name) => path.join(base, name))]
    .find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("@/")) {
      const resolved = resolveFile(path.join(root, "src", specifier.slice(2)));
      if (resolved) return nextResolve(context.conditions.includes("require") ? resolved : pathToFileURL(resolved).href, context);
    }
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".") || !context.parentURL) {
        throw error;
      }
      const resolved = resolveFile(fileURLToPath(new URL(specifier, context.parentURL)));
      if (!resolved) throw error;
      return nextResolve(context.conditions.includes("require") ? resolved : pathToFileURL(resolved).href, context);
    }
  },
});

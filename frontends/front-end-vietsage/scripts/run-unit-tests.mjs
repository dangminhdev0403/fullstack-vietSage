import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const reporter = args.find((arg) => arg.startsWith("--reporter="))?.slice("--reporter=".length) ?? "spec";
const requested = args.filter((arg) => !arg.startsWith("--reporter="));
const files = requested.length ? requested : ["src", "tests", "scripts"].flatMap((dir) =>
  readdirSync(path.join(root, dir), { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.test\.(ts|mjs)$/.test(entry.name))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name))),
);
const result = spawnSync(process.execPath, [
  "--experimental-strip-types",
  "--import", new URL("./unit-test-loader.mjs", import.meta.url).href,
  "--test", "--test-concurrency=2", `--test-reporter=${reporter}`, ...files,
], { cwd: root, stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;

#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const jsonPath = path.join(root, "openapi", "v1", "openapi.json");
const yamlPath = path.join(root, "openapi", "v1", "openapi.yaml");

if (!fs.existsSync(jsonPath)) {
  console.error(`[contract] Missing file: ${jsonPath}`);
  process.exit(1);
}

if (!fs.existsSync(yamlPath)) {
  console.error(`[contract] Missing file: ${yamlPath}`);
  process.exit(1);
}

let spec;
try {
  spec = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
} catch (error) {
  console.error("[contract] Invalid openapi.json:", error.message);
  process.exit(1);
}

const pathCount = Object.keys(spec.paths || {}).length;
if (pathCount === 0) {
  console.error("[contract] openapi.json contains zero paths.");
  process.exit(1);
}

console.log(`[contract] OK: ${pathCount} paths verified.`);

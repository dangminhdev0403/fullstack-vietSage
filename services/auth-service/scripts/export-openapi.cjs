#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");

require("ts-node/register/transpile-only");

const { NestFactory } = require("@nestjs/core");
const { AppModule } = require("../src/app.module");
const { createOpenApiDocument } = require("../src/common/openapi/swagger.config");

async function exportOpenApi() {
  const app = await NestFactory.create(AppModule, { logger: false });

  try {
    const document = createOpenApiDocument(app);
    const outputDir = path.resolve(__dirname, "../../../shared/api-contract/openapi/v1");

    fs.mkdirSync(outputDir, { recursive: true });

    const jsonPath = path.join(outputDir, "openapi.json");
    const yamlPath = path.join(outputDir, "openapi.yaml");

    fs.writeFileSync(jsonPath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
    fs.writeFileSync(yamlPath, YAML.stringify(document), "utf8");

    const totalPaths = Object.keys(document.paths || {}).length;
    console.log(`[openapi] Exported ${totalPaths} paths to ${outputDir}`);
  } finally {
    await app.close();
  }
}

exportOpenApi().catch((error) => {
  console.error("[openapi] Export failed:", error);
  process.exit(1);
});

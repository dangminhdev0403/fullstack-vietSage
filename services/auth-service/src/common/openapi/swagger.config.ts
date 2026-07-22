import { INestApplication } from "@nestjs/common";
import { OpenAPIObject } from "@nestjs/swagger";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export const SWAGGER_PATH = "docs";

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("VietSage Auth Service API")
    .setDescription("HTTP API contract for auth, rbac, and hotel-users modules")
    .setVersion("v1")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
      "bearer",
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  sanitizeOpenApiDocument(document);
  return document;
}

function sanitizeOpenApiDocument(document: OpenAPIObject): void {
  const securitySchemes = document.components?.securitySchemes;
  if (!securitySchemes) {
    return;
  }

  for (const scheme of Object.values(securitySchemes)) {
    if (scheme && typeof scheme === "object" && "type" in scheme && scheme.type === "http") {
      if ("in" in scheme) {
        delete (scheme as { in?: string }).in;
      }
    }
  }
}

export function setupSwagger(app: INestApplication): void {
  const document = createOpenApiDocument(app);

  SwaggerModule.setup(SWAGGER_PATH, app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: "alpha",
      operationsSorter: "alpha",
    },
  });
}

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";
import { TransformationInterceptor } from "./common/interceptors/transformation.interceptor";
import { AppLogger } from "./common/logging/app-logger.service";
import { setupSwagger } from "./common/openapi/swagger.config";
import { loadAppConfig } from "./common/config/env.config";

export function configureApp(app: INestApplication): void {
  const config = loadAppConfig();

  app.enableCors({
    origin: config.corsOrigins,
    credentials: config.corsOrigins.length > 0,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new TransformationInterceptor(app.get(Reflector)));

  if (config.swaggerEnabled) {
    setupSwagger(app);
  }

  app.useGlobalFilters(new GlobalExceptionFilter(app.get(AppLogger)));
}

import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";
import { TransformationInterceptor } from "./common/interceptors/transformation.interceptor";
import { AppLogger } from "./common/logging/app-logger.service";
import { setupSwagger } from "./common/openapi/swagger.config";

export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalInterceptors(new TransformationInterceptor(app.get(Reflector)));

  setupSwagger(app);

  app.useGlobalFilters(new GlobalExceptionFilter(app.get(AppLogger)));
}

import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { RequestLoggingMiddleware } from "./common/middleware/request-logging.middleware";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { IdentityModule } from "./modules/identity/identity.module";
import { GuestOperationsModule } from "./modules/guest-operations/guest-operations.module";
import { EmergencyModule } from "./modules/emergency/emergency.module";
import { JwtAuthGuard } from "./modules/identity/infrastructure/guards/jwt-auth.guard";
import { HealthModule } from "./modules/health/health.module";
import { PropertyModule } from "./modules/property/property.module";
import { OrganizationModule } from "./modules/organization/organization.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthorizationGuard } from "./shared/guard/authorization.guard";
import { CodesModule } from "./modules/codes/codes.module";
import { RequestRealtimeGateway } from "./request-realtime.gateway";
import { BillingModule } from "./modules/billing/billing.module";
import { LoggingModule } from "./common/logging/logging.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { AuthRateLimitGuard } from "./common/security/auth-rate-limit.guard";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    HealthModule,
    LoggingModule,
    PrismaModule,
    IdentityModule,
    OrganizationModule,
    PropertyModule,
    CodesModule,
    BillingModule,
    GuestOperationsModule,
    EmergencyModule,
    NotificationsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: AuthRateLimitGuard,
    },
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: AuthorizationGuard,
    },
    RequestRealtimeGateway,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, RequestLoggingMiddleware).forRoutes("*");
  }
}

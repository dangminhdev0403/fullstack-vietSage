import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { RequestLoggingMiddleware } from "./common/middleware/request-logging.middleware";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { IdentityModule } from "./modules/identity/identity.module";
import { GuestOperationsModule } from "./modules/guest-operations/guest-operations.module";
import { EmergencyModule } from "./modules/emergency/emergency.module";
import { JwtAuthGuard } from "./modules/identity/identity-public";
import { HealthModule } from "./modules/health/health.module";
import { PropertyModule } from "./modules/property/property.module";
import { OrganizationModule } from "./modules/organization/organization.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthorizationGuard } from "./shared/guard/authorization.guard";
import { CodesModule } from "./modules/codes/codes.module";
import { RequestRealtimeModule } from "./modules/request-realtime/request-realtime.module";
import { BillingModule } from "./modules/billing/billing.module";
import { LoggingModule } from "./common/logging/logging.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { AuthRateLimitGuard } from "./common/security/auth-rate-limit.guard";
import { BiometricWorkstationsModule } from "./modules/biometric-workstations/biometric-workstations.module";
import { PlatformBillingModule } from "./modules/platform-billing/platform-billing.module";
import { LocalPartnersModule } from "./modules/local-partners/local-partners.module";
import { MarketplaceModule } from "./modules/marketplace/marketplace.module";

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
    RequestRealtimeModule,
    BiometricWorkstationsModule,
    PlatformBillingModule,
    LocalPartnersModule,
    MarketplaceModule,
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
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware, RequestLoggingMiddleware).forRoutes("*");
  }
}

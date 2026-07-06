import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { RequestLoggingMiddleware } from "./common/middleware/request-logging.middleware";
import { RequestIdMiddleware } from "./common/middleware/request-id.middleware";
import { AuthModule } from "./modules/auth/auth.module";
import { GuestOsModule } from "./modules/guest-os/guest-os.module";
import { EmergencyModule } from "./modules/emergency/emergency.module";
import { JwtAuthGuard } from "./modules/auth/guards/jwt-auth.guard";
import { HealthModule } from "./modules/health/health.module";
import { HotelUsersModule } from "./modules/hotel-users/hotel-users.module";
import { HotelsModule } from "./modules/hotels/hotels.module";
import { RbacModule } from "./modules/rbac/rbac.module";
import { TenantOwnersModule } from "./modules/tenant-owners/tenant-owners.module";
import { PrismaModule } from "./prisma/prisma.module";
import { AuthorizationGuard } from "./shared/guard/authorization.guard";
import { CodesModule } from "./modules/codes/codes.module";
import { RequestRealtimeGateway } from "./request-realtime.gateway";
import { BillingModule } from "./modules/billing/billing.module";
import { LoggingModule } from "./common/logging/logging.module";
import { TelegramModule } from "./modules/telegram/telegram.module";
import { AuthRateLimitGuard } from "./common/security/auth-rate-limit.guard";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    HealthModule,
    LoggingModule,
    PrismaModule,
    AuthModule,
    RbacModule,
    TenantOwnersModule,
    HotelUsersModule,
    HotelsModule,
    CodesModule,
    BillingModule,
    GuestOsModule,
    EmergencyModule,
    TelegramModule,
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

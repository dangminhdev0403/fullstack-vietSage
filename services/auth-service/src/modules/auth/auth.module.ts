import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AuthController } from "./auth.controller";
import { AuthRepository } from "./auth.repository";
import { AuthService } from "./auth.service";
import { AuthorizationService } from "./services/authorization.service";
import { RoutePermissionSyncService } from "./services/route-permission-sync.service";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { LocalStrategy } from "./strategies/local.strategy";

@Module({
  imports: [
    PassportModule.register({
      defaultStrategy: "jwt",
      session: false,
    }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    AuthorizationService,
    RoutePermissionSyncService,
    LocalStrategy,
    JwtStrategy,
  ],
  exports: [AuthService, AuthorizationService, JwtModule],
})
export class AuthModule {}

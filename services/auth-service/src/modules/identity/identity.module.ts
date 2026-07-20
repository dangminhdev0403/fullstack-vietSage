import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaModule } from "../../prisma/prisma.module";
import { AuthController } from "./api/auth.controller";
import { HotelUsersController } from "./api/hotel-users.controller";
import { PermissionsController, RolesController } from "./api/rbac.controller";
import { AuthService } from "./application/authentication.service";
import { AuthorizationService } from "./application/authorization.service";
import { HotelUsersService } from "./application/hotel-users.service";
import { HotelUserDirectoryService } from "./application/hotel-user-directory.service";
import { RbacService } from "./application/rbac.service";
import { RoutePermissionSyncService } from "./application/route-permission-sync.service";
import { AuthRepository } from "./infrastructure/repositories/auth.repository";
import { HotelUsersRepository } from "./infrastructure/repositories/hotel-users.repository";
import { RbacRepository } from "./infrastructure/repositories/rbac.repository";
import { JwtStrategy } from "./infrastructure/strategies/jwt.strategy";
import { LocalStrategy } from "./infrastructure/strategies/local.strategy";

@Module({
  imports: [
    PrismaModule,
    PassportModule.register({
      defaultStrategy: "jwt",
      session: false,
    }),
    JwtModule.register({}),
  ],
  controllers: [AuthController, RolesController, PermissionsController, HotelUsersController],
  providers: [
    AuthService,
    AuthRepository,
    AuthorizationService,
    RoutePermissionSyncService,
    LocalStrategy,
    JwtStrategy,
    RbacService,
    RbacRepository,
    HotelUsersService,
    HotelUserDirectoryService,
    HotelUsersRepository,
  ],
  exports: [AuthService, AuthorizationService, HotelUserDirectoryService, JwtModule],
})
export class IdentityModule {}

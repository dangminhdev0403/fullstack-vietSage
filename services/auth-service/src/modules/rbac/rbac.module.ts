import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PermissionsController, RolesController } from "./rbac.controller";
import { RbacRepository } from "./rbac.repository";
import { RbacService } from "./rbac.service";

@Module({
  imports: [PrismaModule],
  controllers: [RolesController, PermissionsController],
  providers: [RbacService, RbacRepository],
  exports: [RbacService],
})
export class RbacModule {}

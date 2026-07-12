import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { TenantOwnersController } from "./api/tenant-owners.controller";
import { TenantOwnersService } from "./application/tenant-owners.service";
import { TenantOwnersRepository } from "./infrastructure/repositories/tenant-owners.repository";

@Module({
  imports: [PrismaModule],
  controllers: [TenantOwnersController],
  providers: [TenantOwnersService, TenantOwnersRepository],
})
export class OrganizationModule {}

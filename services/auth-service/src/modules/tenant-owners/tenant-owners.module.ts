import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { TenantOwnersController } from "./tenant-owners.controller";
import { TenantOwnersRepository } from "./tenant-owners.repository";
import { TenantOwnersService } from "./tenant-owners.service";

@Module({
  imports: [PrismaModule],
  controllers: [TenantOwnersController],
  providers: [TenantOwnersService, TenantOwnersRepository],
})
export class TenantOwnersModule {}

import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { LocalPartnersController } from "./api/local-partners.controller";
import { GuestLocalPartnersController } from "./api/guest-local-partners.controller";
import { LocalPartnersService } from "./application/local-partners.service";
import { GuestLocalPartnersService } from "./application/guest-local-partners.service";
import { LocalPartnersRepository } from "./infrastructure/local-partners.repository";

@Module({
  imports: [PrismaModule],
  controllers: [LocalPartnersController, GuestLocalPartnersController],
  providers: [
    LocalPartnersRepository,
    LocalPartnersService,
    GuestLocalPartnersService,
  ],
  exports: [LocalPartnersService, GuestLocalPartnersService],
})
export class LocalPartnersModule {}

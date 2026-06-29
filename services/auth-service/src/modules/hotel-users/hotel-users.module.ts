import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { HotelUsersController } from "./hotel-users.controller";
import { HotelUsersRepository } from "./hotel-users.repository";
import { HotelUsersService } from "./hotel-users.service";

@Module({
  imports: [PrismaModule],
  controllers: [HotelUsersController],
  providers: [HotelUsersService, HotelUsersRepository],
})
export class HotelUsersModule {}

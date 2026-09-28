import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PropertyModule } from "../property/property.module";
import { ChannelManagerController } from "./controllers/channel-manager.controller";
import { AriCoreService } from "./services/ari-core.service";
import { ChannelManagerService } from "./services/channel-manager.service";
import { IcalService } from "./services/ical.service";

@Module({
  imports: [PrismaModule, PropertyModule],
  controllers: [ChannelManagerController],
  providers: [ChannelManagerService, AriCoreService, IcalService],
  exports: [ChannelManagerService, AriCoreService, IcalService],
})
export class ChannelManagerModule {}

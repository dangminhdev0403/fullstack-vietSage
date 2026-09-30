import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PropertyModule } from "../property/property.module";
import { ChannelManagerController } from "./controllers/channel-manager.controller";
import { AriCoreService } from "./services/ari-core.service";
import { ChannelManagerService } from "./services/channel-manager.service";
import { ChannexApiClient } from "./services/channex-api-client.service";
import { ChannexAriSyncService } from "./services/channex-ari-sync.service";
import { ChannexBookingIngestionService } from "./services/channex-booking-ingestion.service";
import { ChannexChannelSessionService } from "./services/channex-channel-session.service";
import { ChannexDoctorService } from "./services/channex-doctor.service";
import { ChannexFeedScheduler } from "./services/channex-feed-scheduler.service";
import { ChannexSyncService } from "./services/channex-sync.service";
import { IcalService } from "./services/ical.service";

@Module({
  imports: [PrismaModule, PropertyModule],
  controllers: [ChannelManagerController],
  providers: [
    ChannelManagerService,
    AriCoreService,
    IcalService,
    ChannexApiClient,
    ChannexSyncService,
    ChannexAriSyncService,
    ChannexBookingIngestionService,
    ChannexDoctorService,
    ChannexFeedScheduler,
    ChannexChannelSessionService,
  ],
  exports: [
    ChannelManagerService,
    AriCoreService,
    IcalService,
    ChannexApiClient,
    ChannexSyncService,
    ChannexAriSyncService,
    ChannexBookingIngestionService,
    ChannexDoctorService,
  ],
})
export class ChannelManagerModule {}

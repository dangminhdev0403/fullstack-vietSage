import { Module } from "@nestjs/common";
import { GuestOperationsModule } from "../guest-operations/guest-operations.module";
import { IdentityModule } from "../identity/identity.module";
import { PropertyModule } from "../property/property.module";
import { RequestRealtimeGateway } from "../../request-realtime.gateway";
import { RequestRealtimeController } from "./api/request-realtime.controller";
import { RequestRealtimeTicketService } from "./application/request-realtime-ticket.service";

@Module({
  imports: [IdentityModule, GuestOperationsModule, PropertyModule],
  controllers: [RequestRealtimeController],
  providers: [RequestRealtimeTicketService, RequestRealtimeGateway],
})
export class RequestRealtimeModule {}

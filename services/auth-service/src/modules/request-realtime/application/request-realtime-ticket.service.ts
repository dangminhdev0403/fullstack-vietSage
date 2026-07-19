import { Inject, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { randomUUID } from "node:crypto";
import { loadAppConfig, type RequestRealtimeConfig } from "../../../common/config/env.config";
import { HotelAccessService } from "../../property/property-public";

@Injectable()
export class RequestRealtimeTicketService {
  constructor(
    private readonly hotelAccessService: HotelAccessService,
    private readonly jwtService: JwtService,
    @Optional() @Inject("REQUEST_REALTIME_CONFIG") config?: RequestRealtimeConfig,
  ) {
    this.config = config ?? loadAppConfig().requestRealtime;
  }

  private readonly config: RequestRealtimeConfig;

  async issueOwnerTicket(userId: string, activeRoleId: string, hotelId: string) {
    if (!this.config.enabled || !this.config.ticketSecret) {
      throw new ServiceUnavailableException({
        code: "REQUEST_REALTIME_UNAVAILABLE",
        message: "Request realtime is unavailable",
      });
    }

    await this.hotelAccessService.assertHotelAccess(userId, activeRoleId, hotelId);
    const issuedAt = Date.now();
    const ticket = await this.jwtService.signAsync(
      { sub: userId, hotelId, type: "request_realtime_owner", jti: randomUUID() },
      {
        secret: this.config.ticketSecret,
        audience: this.config.audience,
        expiresIn: this.config.ticketTtlSeconds,
      },
    );

    return {
      ticket,
      expiresAt: new Date(issuedAt + this.config.ticketTtlSeconds * 1000).toISOString(),
    };
  }
}

/* eslint-disable @typescript-eslint/unbound-method */
import { ServiceUnavailableException } from "@nestjs/common";
import type { JwtService } from "@nestjs/jwt";
import type { HotelAccessService } from "../../property/property-public";
import { REQUIRED_PERMISSION_KEY } from "../../../shared/decorators/require-permission.decorator";
import { RequestRealtimeTicketService } from "../application/request-realtime-ticket.service";
import { RequestRealtimeController } from "../api/request-realtime.controller";

describe("RequestRealtimeTicketService", () => {
  const hotelAccessService = { assertHotelAccess: jest.fn() } as unknown as HotelAccessService;
  const jwtService = { signAsync: jest.fn() } as unknown as JwtService;

  beforeEach(() => jest.clearAllMocks());

  it("asserts hotel access and signs only scoped owner claims", async () => {
    (jwtService.signAsync as jest.Mock).mockResolvedValue("signed-ticket");
    const service = new RequestRealtimeTicketService(hotelAccessService, jwtService, {
      enabled: true,
      ticketSecret: "x".repeat(32),
      ticketTtlSeconds: 60,
      audience: "request-realtime",
    });

    const result = await service.issueOwnerTicket("user-1", "active-role", "hotel-1");

    expect(hotelAccessService.assertHotelAccess).toHaveBeenCalledWith(
      "user-1",
      "active-role",
      "hotel-1",
    );
    const [claims, options] = (jwtService.signAsync as jest.Mock).mock.calls[0];
    expect(claims).toEqual(
      expect.objectContaining({
        sub: "user-1",
        hotelId: "hotel-1",
        type: "request_realtime_owner",
        jti: expect.any(String),
      }),
    );
    expect(claims).not.toHaveProperty("email");
    expect(claims).not.toHaveProperty("role");
    expect(claims).not.toHaveProperty("accessToken");
    expect(options).toEqual(
      expect.objectContaining({
        secret: "x".repeat(32),
        audience: "request-realtime",
        expiresIn: 60,
      }),
    );
    expect(result.ticket).toBe("signed-ticket");
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("does not sign when hotel access is denied", async () => {
    (hotelAccessService.assertHotelAccess as jest.Mock).mockRejectedValue(new Error("denied"));
    const service = new RequestRealtimeTicketService(hotelAccessService, jwtService, {
      enabled: true,
      ticketSecret: "x".repeat(32),
      ticketTtlSeconds: 60,
      audience: "request-realtime",
    });
    await expect(service.issueOwnerTicket("user-1", "active-role", "hotel-2")).rejects.toThrow(
      "denied",
    );
    expect(jwtService.signAsync).not.toHaveBeenCalled();
  });

  it("returns deliberate unavailable behavior while disabled", async () => {
    const service = new RequestRealtimeTicketService(hotelAccessService, jwtService, {
      enabled: false,
      ticketSecret: null,
      ticketTtlSeconds: 60,
      audience: "request-realtime",
    });
    await expect(
      service.issueOwnerTicket("user-1", "active-role", "hotel-1"),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});

describe("RequestRealtimeController authorization boundary", () => {
  it("keeps JWT authentication and delegates hotel authorization to the ticket service", () => {
    const issue: unknown = Object.getOwnPropertyDescriptor(
      RequestRealtimeController.prototype,
      "issue",
    )?.value;
    expect(issue).toBeDefined();
    expect(Reflect.getMetadata(REQUIRED_PERMISSION_KEY, issue as object)).toBe(
      "hotel.requests.view",
    );
  });
});

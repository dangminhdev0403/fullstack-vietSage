import type { JwtService } from "@nestjs/jwt";
import { RequestRealtimeGateway } from "../../../request-realtime.gateway";

function socket(auth: unknown) {
  return {
    id: "socket-1",
    handshake: { auth },
    emit: jest.fn(),
    join: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn(),
  };
}

describe("RequestRealtimeGateway handshake", () => {
  const guestOs = { authenticateGuestToken: jest.fn() };
  const jwt = { verifyAsync: jest.fn() } as unknown as JwtService;
  const logger = { socket: jest.fn() };
  const hotelAccess = { resolveRoomScope: jest.fn().mockResolvedValue({ allowedRoomId: null }) };
  const config = {
    enabled: true,
    ticketSecret: "x".repeat(32),
    ticketTtlSeconds: 60,
    audience: "request-realtime" as const,
  };
  const gateway = new RequestRealtimeGateway(guestOs as never, jwt, logger as never, hotelAccess as never, config);

  beforeEach(() => { jest.clearAllMocks(); hotelAccess.resolveRoomScope.mockResolvedValue({ allowedRoomId: null }); });

  it("joins the owner room derived only from a valid signed ticket", async () => {
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({
      sub: "user-1",
      roleId: "role-1",
      hotelId: "hotel-1",
      type: "request_realtime_owner",
      jti: "jti-1",
    });
    const client = socket({ mode: "owner", ticket: "ticket", hotelId: "browser-override" });
    await gateway.handleConnection(client as never);
    expect(jwt.verifyAsync).toHaveBeenCalledWith(
      "ticket",
      expect.objectContaining({ secret: config.ticketSecret, audience: config.audience }),
    );
    expect(client.join).toHaveBeenCalledWith("owner:hotel:hotel-1:requests");
    expect(client.join).not.toHaveBeenCalledWith(expect.stringContaining("browser-override"));
    expect(client.emit).toHaveBeenCalledWith("request_realtime.ready", {
      mode: "owner",
      scope: { hotelId: "hotel-1" },
    });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it("joins the exact room channel when ticket includes roomId", async () => {
    hotelAccess.resolveRoomScope.mockResolvedValue({ allowedRoomId: "room-101" });
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({
      sub: "user-1",
      roleId: "role-1",
      hotelId: "hotel-1",
      roomId: "room-101",
      type: "request_realtime_owner",
      jti: "jti-1",
    });
    const client = socket({ mode: "owner", ticket: "ticket" });
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith("owner:hotel:hotel-1:room:room-101:requests");
    expect(client.join).not.toHaveBeenCalledWith("owner:hotel:hotel-1:requests");
    expect(client.emit).toHaveBeenCalledWith("request_realtime.ready", {
      mode: "owner",
      scope: { hotelId: "hotel-1", roomId: "room-101" },
    });
  });

  it.each([
    [{ mode: "owner" }, "AUTH_REQUIRED"],
    [{ mode: "owner", ticket: "bad" }, "TICKET_INVALID"],
    [{ mode: "unknown", ticket: "bad" }, "AUTH_REQUIRED"],
  ])("rejects invalid owner handshakes", async (auth, code) => {
    (jwt.verifyAsync as jest.Mock).mockRejectedValue(new Error("raw secret exception"));
    const client = socket(auth);
    await gateway.handleConnection(client as never);
    expect(client.emit).toHaveBeenCalledWith("request_realtime.error", { code, retryable: false });
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it.each([{ roomIds: ["room-101", "room-102"] }, { roomIds: [] }])("joins only the signed responsibility room channels", async ({ roomIds }) => {
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({ sub: "user-1", roleId: "role-1", hotelId: "hotel-1", type: "request_realtime_owner", jti: "jti-1", roomIds });
    hotelAccess.resolveRoomScope.mockResolvedValue({ allowedRoomId: null, allowedRoomIds: roomIds } as never);
    const client = socket({ mode: "owner", ticket: "ticket", roomIds: ["browser-override"] });
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledTimes(roomIds.length + 1);
    for (const roomId of roomIds) expect(client.join).toHaveBeenCalledWith(`owner:hotel:hotel-1:room:${roomId}:requests`);
    expect(client.join).not.toHaveBeenCalledWith("owner:hotel:hotel-1:requests");
    expect(client.emit).toHaveBeenCalledWith("request_realtime.ready", { mode: "owner", scope: { hotelId: "hotel-1", roomIds } });
  });

  it("revalidates the signed active role and ignores old room claims after reassignment", async () => {
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({ sub: "user-1", roleId: "role-1", hotelId: "hotel-1", type: "request_realtime_owner", jti: "jti-1", roomIds: ["room-101"] });
    hotelAccess.resolveRoomScope.mockResolvedValue({ allowedRoomId: null, allowedRoomIds: ["room-201"] } as never);
    const client = socket({ mode: "owner", ticket: "old-ticket" });
    await gateway.handleConnection(client as never);
    expect(hotelAccess.resolveRoomScope).toHaveBeenCalledWith("user-1", "role-1", "hotel-1");
    expect(client.join).toHaveBeenCalledWith("owner:hotel:hotel-1:room:room-201:requests");
    expect(client.join).not.toHaveBeenCalledWith("owner:hotel:hotel-1:room:room-101:requests");
    expect(client.join).not.toHaveBeenCalledWith("owner:hotel:hotel-1:requests");
  });

  it("disconnects without joining event channels if current assignment is revoked", async () => {
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({ sub: "user-1", roleId: "role-1", hotelId: "hotel-1", type: "request_realtime_owner", jti: "jti-1", roomIds: ["room-101"] });
    hotelAccess.resolveRoomScope.mockRejectedValueOnce(new Error("revoked"));
    const client = socket({ mode: "owner", ticket: "old-ticket" });
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledTimes(1);
    expect(client.join).toHaveBeenCalledWith("owner:hotel:hotel-1:user:user-1:scope");
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it.each([{ roomIds: "room-101" }, { roomIds: null }, { roomIds: [""] }, { roomIds: [1] }, { roomIds: ["room-101"], roomId: "room-201" }, { roomId: "" }])("rejects malformed signed room scope instead of joining hotel wide", async (roomClaims) => {
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({ sub: "user-1", roleId: "role-1", hotelId: "hotel-1", type: "request_realtime_owner", jti: "jti-1", ...roomClaims });
    const client = socket({ mode: "owner", ticket: "ticket" });
    await gateway.handleConnection(client as never);
    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.emit).toHaveBeenCalledWith("request_realtime.error", { code: "TICKET_INVALID", retryable: false });
  });

  it("distinguishes an expired owner ticket without exposing the verifier error", async () => {
    const expired = Object.assign(new Error("jwt expired at secret timestamp"), {
      name: "TokenExpiredError",
    });
    (jwt.verifyAsync as jest.Mock).mockRejectedValue(expired);
    const client = socket({ mode: "owner", ticket: "expired-ticket" });
    await gateway.handleConnection(client as never);
    expect(client.emit).toHaveBeenCalledWith("request_realtime.error", {
      code: "TICKET_EXPIRED",
      retryable: false,
    });
    expect(client.emit).not.toHaveBeenCalledWith(
      "request_realtime.error",
      expect.objectContaining({ message: expect.stringContaining("secret") }),
    );
  });

  it("rejects wrong owner ticket type even when signature verification succeeds", async () => {
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({
      sub: "user-1",
      roleId: "role-1",
      hotelId: "hotel-1",
      type: "access",
    });
    const client = socket({ mode: "owner", ticket: "ticket" });
    await gateway.handleConnection(client as never);
    expect(client.emit).toHaveBeenCalledWith("request_realtime.error", {
      code: "TICKET_INVALID",
      retryable: false,
    });
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it("authenticates a guest token and joins only its session room", async () => {
    guestOs.authenticateGuestToken.mockResolvedValue({ sessionId: "session-1" });
    const client = socket({ mode: "guest", sessionToken: "guest-token" });
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith("guest-session:session-1");
    expect(client.emit).toHaveBeenCalledWith("request_realtime.ready", {
      mode: "guest",
      scope: { sessionId: "session-1" },
    });
  });

  it("disconnects invalid guests and all clients while disabled", async () => {
    guestOs.authenticateGuestToken.mockRejectedValue(new Error("invalid"));
    const invalid = socket({ mode: "guest", sessionToken: "bad" });
    await gateway.handleConnection(invalid as never);
    expect(invalid.disconnect).toHaveBeenCalledWith(true);

    const disabledGateway = new RequestRealtimeGateway(guestOs as never, jwt, logger as never, hotelAccess as never, {
      ...config,
      enabled: false,
    });
    const disabled = socket({ mode: "guest", sessionToken: "guest-token" });
    await disabledGateway.handleConnection(disabled as never);
    expect(disabled.emit).toHaveBeenCalledWith("request_realtime.error", {
      code: "REALTIME_DISABLED",
      retryable: false,
    });
    expect(disabled.disconnect).toHaveBeenCalledWith(true);
  });
});

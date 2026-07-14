/* eslint-disable @typescript-eslint/unbound-method */
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
  const config = {
    enabled: true,
    ticketSecret: "x".repeat(32),
    ticketTtlSeconds: 60,
    audience: "request-realtime" as const,
  };
  const gateway = new RequestRealtimeGateway(guestOs as never, jwt, logger as never, config);

  beforeEach(() => jest.clearAllMocks());

  it("joins the owner room derived only from a valid signed ticket", async () => {
    (jwt.verifyAsync as jest.Mock).mockResolvedValue({
      sub: "user-1",
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

    const disabledGateway = new RequestRealtimeGateway(guestOs as never, jwt, logger as never, {
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

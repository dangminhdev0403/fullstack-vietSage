import { Inject, Optional } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { loadAppConfig, type RequestRealtimeConfig } from "./common/config/env.config";
import { AppLogger } from "./common/logging/app-logger.service";
import { GuestOsService } from "./modules/guest-operations/guest-operations-public";
import { RequestRealtimeEmitter } from "./request-realtime.emitter";

type OwnerTicketClaims = { sub?: unknown; hotelId?: unknown; type?: unknown; jti?: unknown };
type HandshakeAuth = { mode?: unknown; ticket?: unknown; sessionToken?: unknown };

const realtimeConfig = loadAppConfig();

@WebSocketGateway({
  namespace: "/request-realtime",
  cors: { origin: realtimeConfig.corsOrigins, credentials: realtimeConfig.corsOrigins.length > 0 },
})
export class RequestRealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer() private server!: Server;
  private readonly config: RequestRealtimeConfig;

  constructor(
    private readonly guestOsService: GuestOsService,
    private readonly jwtService: JwtService,
    private readonly logger: AppLogger,
    @Optional() @Inject("REQUEST_REALTIME_CONFIG") config?: RequestRealtimeConfig,
  ) {
    this.config = config ?? realtimeConfig.requestRealtime;
  }

  async handleConnection(socket: Socket) {
    if (!this.config.enabled) return this.reject(socket, "REALTIME_DISABLED");
    const auth = (socket.handshake.auth ?? {}) as HandshakeAuth;
    if (auth.mode === "owner") return this.authenticateOwner(socket, auth);
    if (auth.mode === "guest") return this.authenticateGuest(socket, auth);
    return this.reject(socket, "AUTH_REQUIRED");
  }

  handleDisconnect(socket: Socket) {
    this.logger.socket("Socket disconnected", {
      event: "SOCKET_DISCONNECT",
      eventName: "disconnected",
      socketId: socket.id,
    });
  }

  afterInit(server: Server) {
    RequestRealtimeEmitter.bind(server);
    this.logger.socket("Request realtime gateway initialized", {
      event: "SOCKET_GATEWAY_INITIALIZED",
      eventName: "initialized",
    });
  }

  private async authenticateOwner(socket: Socket, auth: HandshakeAuth) {
    const ticket = typeof auth.ticket === "string" ? auth.ticket.trim() : "";
    if (!ticket || !this.config.ticketSecret) return this.reject(socket, "AUTH_REQUIRED");
    try {
      const claims = await this.jwtService.verifyAsync<OwnerTicketClaims>(ticket, {
        secret: this.config.ticketSecret,
        audience: this.config.audience,
      });
      if (
        claims.type !== "request_realtime_owner" ||
        typeof claims.sub !== "string" ||
        typeof claims.hotelId !== "string" ||
        typeof claims.jti !== "string"
      ) {
        return this.reject(socket, "TICKET_INVALID");
      }
      await socket.join(RequestRealtimeEmitter.ownerHotelRoom(claims.hotelId));
      socket.emit("request_realtime.ready", { mode: "owner", scope: { hotelId: claims.hotelId } });
    } catch (error) {
      return this.reject(
        socket,
        error instanceof Error && error.name === "TokenExpiredError"
          ? "TICKET_EXPIRED"
          : "TICKET_INVALID",
      );
    }
  }

  private async authenticateGuest(socket: Socket, auth: HandshakeAuth) {
    const token = typeof auth.sessionToken === "string" ? auth.sessionToken.trim() : "";
    if (!token) return this.reject(socket, "AUTH_REQUIRED");
    try {
      const session = await this.guestOsService.authenticateGuestToken(token);
      await Promise.all([
        socket.join(RequestRealtimeEmitter.guestSessionRoom(session.sessionId)),
        socket.join(RequestRealtimeEmitter.guestStayRoom(session.stayId)),
      ]);
      socket.emit("request_realtime.ready", {
        mode: "guest",
        scope: { sessionId: session.sessionId, stayId: session.stayId },
      });
    } catch {
      return this.reject(socket, "SESSION_INVALID");
    }
  }

  private reject(socket: Socket, code: string) {
    socket.emit("request_realtime.error", { code, retryable: false });
    socket.disconnect(true);
  }
}

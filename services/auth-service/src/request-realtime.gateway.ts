import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayDisconnect,
  OnGatewayInit,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { AuthService } from "./modules/identity/identity-public";
import { GuestOsService } from "./modules/guest-operations/guest-operations-public";
import { HotelAccessService } from "./modules/property/property-public";
import { AppLogger } from "./common/logging/app-logger.service";
import { RequestRealtimeEmitter } from "./request-realtime.emitter";
import { loadAppConfig } from "./common/config/env.config";

type AccessTokenPayload = {
  jti: string;
  sid: string;
  sub: string;
  email: string;
  roleId: string;
  type: "access";
};

type JoinOwnerHotelPayload = {
  hotelId?: unknown;
  accessToken?: unknown;
};

type JoinGuestSessionPayload = {
  sessionToken?: unknown;
};

const realtimeCorsOrigins = loadAppConfig().corsOrigins;
const realtimeAuthConfig = loadAppConfig().auth;

@WebSocketGateway({
  namespace: "/request-realtime",
  cors: {
    origin: realtimeCorsOrigins,
    credentials: realtimeCorsOrigins.length > 0,
  },
})
export class RequestRealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit
{
  @WebSocketServer()
  private server!: Server;

  constructor(
    private readonly authService: AuthService,
    private readonly guestOsService: GuestOsService,
    private readonly hotelAccessService: HotelAccessService,
    private readonly jwtService: JwtService,
    private readonly logger: AppLogger,
  ) {}

  handleConnection(socket: Socket) {
    this.logger.socket("Socket connected", {
      event: "SOCKET_CONNECT",
      eventName: "connected",
      socketId: socket.id,
    });
    socket.emit("request_realtime.activity", { status: "connected" });
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

  @SubscribeMessage("owner:join_hotel_requests")
  async joinOwnerHotelRequests(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinOwnerHotelPayload,
  ) {
    const hotelId = typeof payload?.hotelId === "string" ? payload.hotelId.trim() : "";
    const accessToken = typeof payload?.accessToken === "string" ? payload.accessToken.trim() : "";

    if (!hotelId || !accessToken) {
      socket.emit("request_realtime.error", { message: "Missing hotelId or accessToken" });
      return { ok: false };
    }

    try {
      const jwtPayload = await this.jwtService.verifyAsync<AccessTokenPayload>(accessToken, {
        secret: this.authService.getAccessTokenSecret(),
        issuer: realtimeAuthConfig.jwtIssuer,
        audience: realtimeAuthConfig.jwtAudience,
      });
      const user = await this.authService.validateJwtPayload(jwtPayload);
      await this.hotelAccessService.assertHotelAccess(user.userId, hotelId);
      const room = RequestRealtimeEmitter.ownerHotelRoom(hotelId);
      await socket.join(room);
      this.logger.socket("Socket joined room", {
        event: "SOCKET_JOIN",
        eventName: "joined",
        socketId: socket.id,
        room,
      });
      socket.emit("request_realtime.joined", { room: "owner_hotel_requests", hotelId });
      return { ok: true, room: "owner_hotel_requests" };
    } catch {
      socket.emit("request_realtime.error", { message: "Unauthorized hotel request room" });
      return { ok: false };
    }
  }

  @SubscribeMessage("guest:join_session_requests")
  async joinGuestSessionRequests(
    @ConnectedSocket() socket: Socket,
    @MessageBody() payload: JoinGuestSessionPayload,
  ) {
    const sessionToken =
      typeof payload?.sessionToken === "string" ? payload.sessionToken.trim() : "";

    if (!sessionToken) {
      socket.emit("request_realtime.error", { message: "Missing sessionToken" });
      return { ok: false };
    }

    try {
      const session = await this.guestOsService.authenticateGuestToken(sessionToken);
      const room = RequestRealtimeEmitter.guestSessionRoom(session.sessionId);
      await socket.join(room);
      this.logger.socket("Socket joined room", {
        event: "SOCKET_JOIN",
        eventName: "joined",
        socketId: socket.id,
        room,
      });
      socket.emit("request_realtime.joined", { room: "guest_session" });
      return { ok: true, room: "guest_session" };
    } catch {
      socket.emit("request_realtime.error", { message: "Unauthorized guest request room" });
      return { ok: false };
    }
  }
}

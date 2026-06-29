import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { AppLogger } from "../../../common/logging/app-logger.service";
import { GuestOsService, type GuestSessionContext } from "../guest-os.service";

export interface RequestWithGuestSession extends Request {
  guestSession: GuestSessionContext;
}

@Injectable()
export class GuestSessionGuard implements CanActivate {
  constructor(
    private readonly guestOsService: GuestOsService,
    private readonly logger: AppLogger = new AppLogger(),
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithGuestSession>();
    const token = this.extractBearerToken(request);
    request.guestSession = await this.guestOsService.authenticateGuestToken(token);
    this.logger.debug("Guest session token authenticated", {
      module: "guest_os",
      service: "GuestSessionGuard",
      operation: "canActivate",
      event: "GUEST_SESSION_AUTHENTICATED",
      sessionId: request.guestSession.sessionId,
      stayId: request.guestSession.stayId,
      roomId: request.guestSession.roomId,
    });
    return true;
  }

  private extractBearerToken(request: Request): string {
    const header = request.headers.authorization;
    if (!header) {
      this.logGuestAuthFailure("missing_bearer_token", request);
      throw new UnauthorizedException("Token phiên khách là bắt buộc");
    }

    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token?.trim()) {
      this.logGuestAuthFailure("invalid_bearer_scheme", request);
      throw new UnauthorizedException("Token phiên khách phải dùng kiểu Bearer");
    }

    return token;
  }

  private logGuestAuthFailure(reason: string, request: Request): void {
    this.logger.warn("Guest session authentication failed", {
      module: "guest_os",
      service: "GuestSessionGuard",
      operation: "extractBearerToken",
      event: "GUEST_SESSION_AUTHENTICATION_FAILURE",
      reason,
      method: request.method,
      url: request.originalUrl,
    });
  }
}

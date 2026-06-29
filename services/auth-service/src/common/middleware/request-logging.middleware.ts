import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { AppLogger } from "../logging/app-logger.service";
import { RequestContext } from "../logging/request-context";

interface RequestWithId extends Request {
  requestId?: string;
  user?: {
    userId?: string;
    email?: string;
    roleId?: string;
  };
  guestSession?: {
    sessionId?: string;
    stayId?: string;
    roomId?: string;
  };
}

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  constructor(private readonly logger: AppLogger) {}

  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const startedAt = Date.now();

    res.on("finish", () => {
      const durationMs = Date.now() - startedAt;
      RequestContext.update({
        userId: req.user?.userId,
        userEmail: req.user?.email,
        roleId: req.user?.roleId,
        guestSessionId: req.guestSession?.sessionId,
        guestStayId: req.guestSession?.stayId,
        guestRoomId: req.guestSession?.roomId,
      });
      this.logger.http({
        operation: "request",
        event: "HTTP_REQUEST_COMPLETED",
        requestId: req.requestId ?? "unknown",
        method: req.method,
        url: req.originalUrl,
        statusCode: res.statusCode,
        durationMs,
        ip: resolveIp(req),
        userAgent: req.header("user-agent"),
        authenticatedUser: req.user
          ? { userId: req.user.userId, email: req.user.email, roleId: req.user.roleId }
          : undefined,
        guestSession: req.guestSession
          ? {
              sessionId: req.guestSession.sessionId,
              stayId: req.guestSession.stayId,
              roomId: req.guestSession.roomId,
            }
          : undefined,
      });
    });

    next();
  }
}

function resolveIp(req: Request): string | undefined {
  const forwardedFor = req.header("x-forwarded-for");
  if (forwardedFor?.trim()) {
    return forwardedFor.split(",")[0]?.trim();
  }

  return req.ip;
}

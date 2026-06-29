import { ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Request } from "express";
import { publicMatcher } from "../../../common/config/routes.config";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  canActivate(context: ExecutionContext) {
    if (context.getType() !== "http") {
      return true;
    }

    if (this.isPublicRoute(context)) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = unknown>(
    err: unknown,
    user: TUser,
    _info: unknown,
    context: ExecutionContext,
  ): TUser | null {
    if (this.isPublicRoute(context)) {
      return user ?? null;
    }

    if (err || !user) {
      throw err || new UnauthorizedException(this.resolveAuthFailureReason(_info));
    }

    return user;
  }

  private isPublicRoute(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    return publicMatcher.isPublic(this.resolveRequestPath(request));
  }

  private resolveRequestPath(request: Request): string {
    const requestPath = request.path?.trim();
    if (requestPath) {
      return requestPath;
    }

    const originalUrl = request.originalUrl?.trim();
    if (!originalUrl) {
      return "/";
    }

    const [path] = originalUrl.split("?");
    return path && path.length > 0 ? path : "/";
  }
  private resolveAuthFailureReason(info: unknown): string {
    if (info instanceof Error) {
      if (info.name === "TokenExpiredError") {
        return "Access token has expired";
      }

      if (info.name === "JsonWebTokenError") {
        return info.message.includes("signature")
          ? "Access token signature is invalid"
          : "Access token is invalid";
      }

      return info.message || "Access token is invalid";
    }

    return "Authorization bearer token is missing or invalid";
  }
}

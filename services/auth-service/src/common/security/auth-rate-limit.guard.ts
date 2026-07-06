import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { loadAppConfig } from "../config/env.config";
import { AUTH_RATE_LIMIT_METADATA_KEY, type AuthRateLimitKey } from "./auth-rate-limit.decorator";

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateLimitBucket>();

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const key = this.reflector.get<AuthRateLimitKey>(
      AUTH_RATE_LIMIT_METADATA_KEY,
      context.getHandler(),
    );

    if (!key) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const config = loadAppConfig().rateLimits[key];
    const now = Date.now();
    const bucketKey = `${key}:${this.resolveClientId(request)}`;
    const existing = this.buckets.get(bucketKey);

    if (!existing || existing.resetAt <= now) {
      this.buckets.set(bucketKey, {
        count: 1,
        resetAt: now + config.ttlSeconds * 1000,
      });
      return true;
    }

    if (existing.count >= config.limit) {
      throw new HttpException(
        "Too many auth requests. Please try again later.",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    existing.count += 1;
    return true;
  }

  private resolveClientId(request: Request): string {
    const forwardedFor = request.headers["x-forwarded-for"];
    if (typeof forwardedFor === "string" && forwardedFor.trim().length > 0) {
      return forwardedFor.split(",", 1)[0].trim();
    }

    if (Array.isArray(forwardedFor) && forwardedFor[0]?.trim()) {
      return forwardedFor[0].split(",", 1)[0].trim();
    }

    return request.ip ?? request.socket.remoteAddress ?? "unknown";
  }
}

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
  private static readonly MAX_BUCKETS = 10_000;
  private static readonly CLEANUP_BATCH_SIZE = 100;
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
    const configKey = key === "change-password" ? "login" : key;
    const config = loadAppConfig().rateLimits[configKey];
    const now = Date.now();
    this.removeExpiredBuckets(now);
    const bucketKey = `${key}:${this.resolveClientId(request)}`;
    const existing = this.buckets.get(bucketKey);

    if (!existing || existing.resetAt <= now) {
      if (existing) {
        this.buckets.delete(bucketKey);
      }
      this.ensureBucketCapacity();
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
    const peerAddress = request.ip ?? request.socket.remoteAddress ?? "unknown";
    const forwardedFor = request.headers["x-forwarded-for"];
    const trustedProxies = new Set(
      loadAppConfig().trustedProxies.map((address) => this.normalizeIp(address)),
    );
    if (trustedProxies.has(this.normalizeIp(peerAddress))) {
      const chain = (Array.isArray(forwardedFor) ? forwardedFor.join(",") : forwardedFor)
        ?.split(",")
        .map((address) => address.trim())
        .filter(Boolean);
      if (chain) {
        for (let index = chain.length - 1; index >= 0; index -= 1) {
          const address = chain[index];
          if (address && !trustedProxies.has(this.normalizeIp(address))) {
            return address;
          }
        }
      }
    }

    return peerAddress;
  }

  private removeExpiredBuckets(now: number): void {
    const batch = Array.from(this.buckets.entries()).slice(
      0,
      AuthRateLimitGuard.CLEANUP_BATCH_SIZE,
    );
    for (const [key, bucket] of batch) {
      this.buckets.delete(key);
      if (bucket.resetAt <= now) {
        continue;
      }
      this.buckets.set(key, bucket);
    }
  }

  private ensureBucketCapacity(): void {
    if (this.buckets.size >= AuthRateLimitGuard.MAX_BUCKETS) {
      throw new HttpException(
        "Auth rate limiter is at capacity. Please try again later.",
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private normalizeIp(address: string): string {
    return address.trim().replace(/^::ffff:/, "");
  }
}

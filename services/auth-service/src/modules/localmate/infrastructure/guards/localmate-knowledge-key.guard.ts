import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export interface ConfigServiceLike {
  get<T = any>(key: string): T | undefined;
}

export const LOCALMATE_KNOWLEDGE_KEY_HEADER = "x-vietsage-knowledge-key";

@Injectable()
export class LocalmateKnowledgeKeyGuard implements CanActivate {
  constructor(@Optional() private readonly configService?: ConfigServiceLike) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const rawHeader =
      request.headers?.[LOCALMATE_KNOWLEDGE_KEY_HEADER] ??
      request.headers?.["X-VietSage-Knowledge-Key" as keyof typeof request.headers] ??
      (typeof request.get === "function" ? request.get(LOCALMATE_KNOWLEDGE_KEY_HEADER) : undefined);

    const requestKey = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;

    const serverKey =
      this.configService?.get<string>("localMate.knowledgeApiKey") ??
      this.configService?.get<string>("LOCALMATE_KNOWLEDGE_API_KEY") ??
      process.env.LOCALMATE_KNOWLEDGE_API_KEY;

    if (!serverKey) {
      throw new ServiceUnavailableException("Knowledge service key unconfigured");
    }

    if (!requestKey || typeof requestKey !== "string") {
      throw new UnauthorizedException("Invalid or missing knowledge API key");
    }

    const requestKeyBuffer = Buffer.from(requestKey);
    const serverKeyBuffer = Buffer.from(serverKey);

    if (
      requestKeyBuffer.length !== serverKeyBuffer.length ||
      !timingSafeEqual(requestKeyBuffer, serverKeyBuffer)
    ) {
      throw new UnauthorizedException("Invalid or missing knowledge API key");
    }

    return true;
  }
}

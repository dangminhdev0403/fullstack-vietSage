import { randomUUID } from "crypto";
import { Injectable, NestMiddleware } from "@nestjs/common";
import { NextFunction, Request, Response } from "express";
import { REQUEST_ID_HEADER } from "../constants/request.constants";
import { RequestContext } from "../logging/request-context";

interface RequestWithId extends Request {
  requestId?: string;
}

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: RequestWithId, res: Response, next: NextFunction): void {
    const requestIdHeader = req.header(REQUEST_ID_HEADER);
    const requestId =
      requestIdHeader && requestIdHeader.trim().length > 0 ? requestIdHeader : randomUUID();

    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    RequestContext.run(
      {
        requestId,
        method: req.method,
        url: req.originalUrl ?? req.url,
        ip: resolveIp(req),
        userAgent: req.header("user-agent"),
      },
      next,
    );
  }
}

function resolveIp(req: Request): string | undefined {
  const forwardedFor = req.header("x-forwarded-for");
  if (forwardedFor?.trim()) {
    return forwardedFor.split(",")[0]?.trim();
  }

  return req.ip;
}

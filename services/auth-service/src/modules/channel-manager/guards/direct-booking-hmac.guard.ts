import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import type { Request } from "express";
import { assertDirectBookingHmac } from "../services/direct-booking-hmac.util";

@Injectable()
export class DirectBookingHmacGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    return assertDirectBookingHmac(request);
  }
}

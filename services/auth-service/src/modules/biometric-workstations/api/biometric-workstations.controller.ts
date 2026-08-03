import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { HotelAccessService } from "../../property/application/hotel-access.service";
import { BiometricWorkstationsService } from "../application/biometric-workstations.service";

type RequestWithUser = Request & { user: AuthenticatedUser };

function bearer(value: string | undefined) {
  const [scheme, token] = value?.trim().split(/\s+/, 2) ?? [];
  if (scheme?.toLowerCase() !== "bearer" || !token)
    throw new UnauthorizedException("Thiếu thông tin kết nối máy quét");
  return token;
}

@ApiTags("biometric-workstations")
@Controller()
export class BiometricWorkstationsController {
  constructor(
    private readonly service: BiometricWorkstationsService,
    private readonly hotelAccessService: HotelAccessService,
  ) {}

  @ApiDescript("Ghép nối trạm sinh trắc học bằng mã dùng một lần")
  @Post("biometric-workstations/pair")
  pair(@Body() body: { code?: unknown }) {
    return this.service.pair(typeof body?.code === "string" ? body.code : "");
  }

  @ApiDescript("Xác thực credential trạm sinh trắc học")
  @Post("biometric-workstations/authenticate")
  authenticate(@Headers("authorization") authorization?: string) {
    return this.service.authenticate(bearer(authorization));
  }

  @ApiBearerAuth()
  @RequirePermission("hotel.stays.manage")
  @ApiDescript("Cấp mã ghép nối trạm sinh trắc học")
  @Post("hotels/:hotelId/biometric-workstations/pairing")
  async issuePairing(@Req() request: RequestWithUser, @Param("hotelId") hotelId: string) {
    await this.hotelAccessService.assertHotelAccess(
      request.user.userId,
      request.user.roleId,
      hotelId,
    );
    return this.service.issuePairing(hotelId, request.user.userId);
  }

  @ApiBearerAuth()
  @RequirePermission("hotel.stays.manage")
  @ApiDescript("Kiểm tra trạng thái trạm sinh trắc học")
  @Get("hotels/:hotelId/biometric-workstations/status")
  async status(@Req() request: RequestWithUser, @Param("hotelId") hotelId: string) {
    await this.hotelAccessService.assertHotelAccess(
      request.user.userId,
      request.user.roleId,
      hotelId,
    );
    return { online: await this.service.hasOnlineWorkstation(hotelId) };
  }

  @ApiBearerAuth()
  @RequirePermission("hotel.stays.manage")
  @ApiDescript("Thu hồi kết nối trạm sinh trắc học")
  @Delete("hotels/:hotelId/biometric-workstations")
  async disconnect(@Req() request: RequestWithUser, @Param("hotelId") hotelId: string) {
    await this.hotelAccessService.assertHotelAccess(
      request.user.userId,
      request.user.roleId,
      hotelId,
    );
    return { disconnected: true, revoked: await this.service.disconnectHotel(hotelId) };
  }
}

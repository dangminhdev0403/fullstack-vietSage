import { Body, Controller, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { ApiParam, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { z } from "zod";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { hotelIdParamSchema } from "../../property/property-public";
import { HotelNotificationRoutesService } from "../application/hotel-notification-routes.service";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

const routeBodySchema = z
  .object({
    serviceCategoryId: z.string().trim().min(1).nullable().optional(),
    telegramChatId: z.string().trim().min(1),
    isActive: z.boolean().optional(),
  })
  .strict();

const updateRouteBodySchema = routeBodySchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

@ApiTags("hotel-notification-routes")
@Controller("hotels")
export class HotelNotificationRoutesController {
  constructor(private readonly routesService: HotelNotificationRoutesService) {}

  @SuccessMessage("Lấy cấu hình Telegram thành công")
  @ApiDescript("Quản lý cấu hình Telegram")
  @ApiParam({ name: "hotelId", type: String })
  @Get(":hotelId/notification-routes")
  async list(@Req() request: RequestWithUser, @Param("hotelId") hotelIdParam: string) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    return this.routesService.list(request.user.userId, request.user.roleId, hotelId);
  }

  @SuccessMessage("Tạo cấu hình Telegram thành công")
  @ApiDescript("Quản lý cấu hình Telegram")
  @ApiParam({ name: "hotelId", type: String })
  @Post(":hotelId/notification-routes")
  async create(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    return this.routesService.create(
      request.user.userId,
      request.user.roleId,
      hotelId,
      parseWithZod(routeBodySchema, body),
    );
  }

  @SuccessMessage("Cập nhật cấu hình Telegram thành công")
  @ApiDescript("Quản lý cấu hình Telegram")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "routeId", type: String })
  @Patch(":hotelId/notification-routes/:routeId")
  async update(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("routeId") routeId: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    return this.routesService.update(
      request.user.userId,
      request.user.roleId,
      hotelId,
      routeId,
      parseWithZod(updateRouteBodySchema, body),
    );
  }
}

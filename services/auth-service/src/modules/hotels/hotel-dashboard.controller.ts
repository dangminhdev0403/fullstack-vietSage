import { Controller, Get, Param, Req } from "@nestjs/common";
import { ApiOkResponse, ApiParam, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { parseWithZod } from "../../common/validation/parse-with-zod";
import { ApiDescript } from "../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../auth/interfaces/authenticated-user.interface";
import { HotelDashboardService } from "./hotel-dashboard.service";
import { hotelIdParamSchema } from "./schemas/hotels.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("hotel-dashboard")
@Controller("hotels")
export class HotelDashboardController {
  constructor(private readonly hotelDashboardService: HotelDashboardService) {}

  @SuccessMessage("Lấy dashboard vận hành khách sạn thành công")
  @ApiDescript("Xem tổng quan khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiOkResponse({ description: "Dashboard vận hành khách sạn" })
  @Get(":hotelId/dashboard")
  async getDashboard(@Req() request: RequestWithUser, @Param("hotelId") hotelIdParam: string) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    return this.hotelDashboardService.getDashboard(request.user.userId, hotelId);
  }
}

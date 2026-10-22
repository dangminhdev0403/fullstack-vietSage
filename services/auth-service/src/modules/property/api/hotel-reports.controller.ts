import { Controller, Get, Param, Query, Req } from "@nestjs/common";
import { ApiOkResponse, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { HotelReportsService } from "../application/hotel-reports.service";
import { hotelIdParamSchema } from "../domain/schemas/shared.schema";
import { getHotelReportsQuerySchema } from "../domain/schemas/hotel-reports.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("hotel-reports")
@Controller("hotels")
export class HotelReportsController {
  constructor(private readonly hotelReportsService: HotelReportsService) {}

  @SuccessMessage("Lấy báo cáo và thống kê khách sạn thành công")
  @RequirePermission("hotel.dashboard.view")
  @ApiDescript("Báo cáo và thống kê chi tiết khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiQuery({ name: "range", required: false, type: String })
  @ApiQuery({ name: "from", required: false, type: String })
  @ApiQuery({ name: "to", required: false, type: String })
  @ApiOkResponse({ description: "Báo cáo và thống kê chi tiết khách sạn" })
  @Get(":hotelId/reports")
  async getReports(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const parsedQuery = parseWithZod(getHotelReportsQuerySchema, query);

    return this.hotelReportsService.getReports(
      request.user.userId,
      request.user.roleId,
      hotelId,
      parsedQuery,
    );
  }
}

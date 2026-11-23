import { Body, Controller, Get, Param, Put, Query, Req } from "@nestjs/common";
import { ApiBody, ApiOkResponse, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { successEnvelopeSchema } from "../../../common/openapi/contract-schemas";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { HotelReportsService } from "../application/hotel-reports.service";
import { hotelIdParamSchema } from "../domain/schemas/shared.schema";
import {
  getHotelReportsQuerySchema,
  upsertHotelRevenueTargetSchema,
} from "../domain/schemas/hotel-reports.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

const upsertRevenueTargetResponseSchema = successEnvelopeSchema(
  {
    type: "object",
    required: ["hotelId", "month", "targetAmount", "revenueTargets"],
    properties: {
      hotelId: { type: "string" },
      month: { type: "string", pattern: "^\\d{4}-(0[1-9]|1[0-2])$" },
      targetAmount: { type: "number", nullable: true },
      revenueTargets: {
        type: "object",
        additionalProperties: { type: "number" },
      },
    },
  },
  200,
  "Đã cập nhật mục tiêu doanh thu tháng",
);

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

  @SuccessMessage("Đã cập nhật mục tiêu doanh thu tháng")
  @RequirePermission("hotel.billing.manage")
  @ApiDescript("Cập nhật hoặc xóa mục tiêu doanh thu theo tháng của khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiBody({
    schema: {
      type: "object",
      required: ["month", "targetAmount"],
      properties: {
        month: {
          type: "string",
          pattern: "^\\d{4}-(0[1-9]|1[0-2])$",
          example: "2026-11",
          description: "Tháng mục tiêu theo định dạng YYYY-MM",
        },
        targetAmount: {
          type: "number",
          minimum: 0,
          maximum: 9_999_999_999,
          example: 150000000,
          description: "Mục tiêu doanh thu VND (nhập 0 để xóa mục tiêu tháng)",
        },
      },
    },
  })
  @ApiOkResponse({ schema: upsertRevenueTargetResponseSchema })
  @Put(":hotelId/reports/targets")
  async upsertRevenueTarget(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const parsedBody = parseWithZod(upsertHotelRevenueTargetSchema, body);

    return this.hotelReportsService.upsertRevenueTarget(
      request.user.userId,
      request.user.roleId,
      hotelId,
      parsedBody,
    );
  }
}

import { Controller, Delete, Get, Param, Put, Query, Req } from "@nestjs/common";
import { ApiOkResponse, ApiParam, ApiQuery, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  hotelStaffAssignmentDataSchema,
  listHotelStaffAssignmentsDataSchema,
  revokeHotelStaffAssignmentDataSchema,
  successEnvelopeSchema,
} from "../../../common/openapi/contract-schemas";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { HotelStaffAssignmentsService } from "../application/hotel-staff-assignments.service";
import {
  hotelStaffUserIdParamSchema,
  listHotelStaffAssignmentsQuerySchema,
} from "../domain/schemas/hotel-staff-assignments.schema";
import { hotelIdParamSchema } from "../domain/schemas/shared.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("hotel-staff")
@Controller("hotels/:hotelId/staff-assignments")
export class HotelStaffAssignmentsController {
  constructor(private readonly hotelStaffAssignmentsService: HotelStaffAssignmentsService) {}

  @RequirePermission("hotel.staff.view")
  @SuccessMessage("Lấy danh sách phân công nhân viên thành công")
  @ApiDescript("Xem phân công nhân viên khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "status", required: false, enum: ["ACTIVE", "REVOKED"] })
  @ApiOkResponse({
    schema: successEnvelopeSchema(
      listHotelStaffAssignmentsDataSchema,
      200,
      "Lấy danh sách phân công nhân viên thành công",
    ),
  })
  @Get()
  async list(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdRaw: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdRaw);
    const parsedQuery = parseWithZod(listHotelStaffAssignmentsQuerySchema, query);
    return this.hotelStaffAssignmentsService.list(
      request.user.userId,
      request.user.roleId,
      hotelId,
      parsedQuery,
    );
  }

  @RequirePermission("hotel.staff.manage")
  @SuccessMessage("Phân công nhân viên vào khách sạn thành công")
  @ApiDescript("Phân công nhân viên vào khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "userId", type: String })
  @ApiOkResponse({
    schema: successEnvelopeSchema(
      hotelStaffAssignmentDataSchema,
      200,
      "Phân công nhân viên vào khách sạn thành công",
    ),
  })
  @Put(":userId")
  async assign(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdRaw: string,
    @Param("userId") userIdRaw: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdRaw);
    const userId = parseWithZod(hotelStaffUserIdParamSchema, userIdRaw);
    return this.hotelStaffAssignmentsService.assign(
      request.user.userId,
      request.user.roleId,
      hotelId,
      userId,
    );
  }

  @RequirePermission("hotel.staff.manage")
  @SuccessMessage("Thu hồi phân công nhân viên thành công")
  @ApiDescript("Thu hồi phân công nhân viên khỏi khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "userId", type: String })
  @ApiOkResponse({
    schema: successEnvelopeSchema(
      revokeHotelStaffAssignmentDataSchema,
      200,
      "Thu hồi phân công nhân viên thành công",
    ),
  })
  @Delete(":userId")
  async revoke(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdRaw: string,
    @Param("userId") userIdRaw: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdRaw);
    const userId = parseWithZod(hotelStaffUserIdParamSchema, userIdRaw);
    return this.hotelStaffAssignmentsService.revoke(
      request.user.userId,
      request.user.roleId,
      hotelId,
      userId,
    );
  }
}

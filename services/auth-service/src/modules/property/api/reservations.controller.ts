import { Body, Controller, Get, Param, Post, Put, Query, Req } from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { ReservationsService } from "../application/reservations.service";
import {
  assignReservationRoomBodySchema,
  createReservationBodySchema,
  listArrivalsQuerySchema,
} from "../domain/schemas/reservations.schema";
import { hotelIdParamSchema, reservationIdParamSchema } from "../domain/schemas/shared.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

const reservationResponseSchema = {
  type: "object",
  required: ["id", "hotelId", "reservationCode", "guestDisplayName", "status"],
  properties: {
    id: { type: "string" },
    hotelId: { type: "string" },
    roomId: { type: "string", nullable: true },
    reservationCode: { type: "string" },
    guestDisplayName: { type: "string" },
    guestPhone: { type: "string", nullable: true },
    status: { type: "string", enum: ["CONFIRMED", "ARRIVAL_READY", "CHECKED_IN"] },
    plannedCheckInAt: { type: "string", format: "date-time" },
    plannedCheckOutAt: { type: "string", format: "date-time" },
  },
};

const checkInResponseSchema = {
  type: "object",
  required: ["idempotent", "accessCode", "reservation", "stay", "folio", "roomQrCode"],
  properties: {
    idempotent: { type: "boolean" },
    accessCode: {
      type: "string",
      nullable: true,
      description: "Plaintext GuestOS access code on the first successful check-in; null on replay",
    },
    reservation: {
      type: "object",
      required: ["id", "status"],
      properties: { id: { type: "string" }, status: { type: "string", enum: ["CHECKED_IN"] } },
    },
    stay: {
      type: "object",
      required: ["id", "status"],
      properties: { id: { type: "string" }, status: { type: "string", enum: ["ACTIVE"] } },
    },
    folio: {
      type: "object",
      required: ["id", "status"],
      properties: { id: { type: "string" }, status: { type: "string", enum: ["OPEN"] } },
    },
    roomQrCode: {
      type: "object",
      nullable: true,
      required: ["id", "status"],
      properties: { id: { type: "string" }, status: { type: "string", enum: ["ACTIVE"] } },
    },
  },
};

@ApiTags("hotel-reservations")
@Controller("hotels")
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @SuccessMessage("Tạo đặt phòng thành công")
  @ApiDescript("Tạo đặt phòng chưa cần gán phòng")
  @ApiParam({ name: "hotelId", type: String })
  @ApiBody({
    schema: {
      type: "object",
      required: ["guestDisplayName", "plannedCheckInAt", "plannedCheckOutAt"],
      properties: {
        guestDisplayName: { type: "string" },
        guestPhone: { type: "string" },
        plannedCheckInAt: { type: "string", format: "date-time" },
        plannedCheckOutAt: { type: "string", format: "date-time" },
      },
    },
  })
  @ApiCreatedResponse({
    description: "Đã tạo đặt phòng ở trạng thái CONFIRMED",
    schema: reservationResponseSchema,
  })
  @Post(":hotelId/reservations")
  async createReservation(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const dto = parseWithZod(createReservationBodySchema, body);
    return this.reservationsService.createReservation(
      request.user.userId,
      request.user.roleId,
      hotelId,
      dto,
    );
  }

  @SuccessMessage("Lấy danh sách khách đến thành công")
  @ApiDescript("Danh sách khách dự kiến đến theo khoảng thời gian")
  @ApiParam({ name: "hotelId", type: String })
  @ApiQuery({ name: "from", required: true, type: String })
  @ApiQuery({ name: "to", required: true, type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({
    description: "Đã lấy danh sách arrivals",
    schema: {
      type: "object",
      required: ["page", "limit", "total", "items"],
      properties: {
        page: { type: "integer" },
        limit: { type: "integer" },
        total: { type: "integer" },
        items: { type: "array", items: reservationResponseSchema },
      },
    },
  })
  @Get(":hotelId/arrivals")
  async listArrivals(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const dto = parseWithZod(listArrivalsQuerySchema, query);
    return this.reservationsService.listArrivals(
      request.user.userId,
      request.user.roleId,
      hotelId,
      dto,
    );
  }

  @SuccessMessage("Gán phòng cho đặt phòng thành công")
  @ApiDescript("Gán phòng sẵn sàng và không trùng lịch")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "reservationId", type: String })
  @ApiBody({
    schema: {
      type: "object",
      required: ["roomId"],
      properties: { roomId: { type: "string" } },
    },
  })
  @ApiOkResponse({
    description: "Đặt phòng đã sẵn sàng đón khách",
    schema: reservationResponseSchema,
  })
  @Put(":hotelId/reservations/:reservationId/room")
  async assignRoom(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("reservationId") reservationIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const reservationId = parseWithZod(reservationIdParamSchema, reservationIdParam);
    const dto = parseWithZod(assignReservationRoomBodySchema, body);
    return this.reservationsService.assignRoom(
      request.user.userId,
      request.user.roleId,
      hotelId,
      reservationId,
      dto,
    );
  }

  @SuccessMessage("Check-in đặt phòng thành công")
  @ApiDescript("Tạo stay và folio theo transaction")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "reservationId", type: String })
  @ApiOkResponse({
    description: "Đặt phòng đã được check-in",
    schema: checkInResponseSchema,
  })
  @Post(":hotelId/reservations/:reservationId/check-in")
  async checkIn(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("reservationId") reservationIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const reservationId = parseWithZod(reservationIdParamSchema, reservationIdParam);
    return this.reservationsService.checkIn(
      request.user.userId,
      request.user.roleId,
      hotelId,
      reservationId,
    );
  }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
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
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { ReservationsService } from "../application/reservations.service";
import {
  assignReservationRoomBodySchema,
  cancelReservationBodySchema,
  checkInReservationBodySchema,
  createBulkReservationsBodySchema,
  createReservationBodySchema,
  listArrivalsQuerySchema,
  markNoShowBodySchema,
  roomPlanQuerySchema,
  updateReservationPlacementBodySchema,
  updateReservationDatesBodySchema,
  updateReservationBodySchema,
  groupCodeParamSchema,
  updateGroupReservationBodySchema,
  createBookingSourcePartnerBodySchema,
  updateBookingSourcePartnerBodySchema,
  listBookingSourcePartnersQuerySchema,
  upsertConfirmationTemplateBodySchema,
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
    roomTypeId: { type: "string", nullable: true },
    guestCount: { type: "integer", nullable: true },
    notes: { type: "string", nullable: true },
    nightlyRateSnapshot: { type: "string", nullable: true },
    reservationCode: { type: "string" },
    guestDisplayName: { type: "string" },
    guestPhone: { type: "string", nullable: true },
    status: {
      type: "string",
      enum: ["CONFIRMED", "ARRIVAL_READY", "CHECKED_IN", "CANCELLED", "NO_SHOW"],
    },
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

const groupReservationItemSchema = {
  type: "object",
  required: ["id", "reservationCode", "status", "plannedCheckInAt", "plannedCheckOutAt"],
  properties: {
    id: { type: "string" },
    reservationCode: { type: "string" },
    roomId: { type: "string", nullable: true },
    roomNumber: { type: "string", nullable: true },
    roomName: { type: "string", nullable: true },
    roomTypeId: { type: "string", nullable: true },
    roomTypeName: { type: "string", nullable: true },
    roomTypeCode: { type: "string", nullable: true },
    guestDisplayName: { type: "string" },
    guestPhone: { type: "string", nullable: true },
    status: {
      type: "string",
      enum: ["CONFIRMED", "ARRIVAL_READY", "CHECKED_IN", "CANCELLED", "NO_SHOW"],
    },
    plannedCheckInAt: { type: "string", format: "date-time" },
    plannedCheckOutAt: { type: "string", format: "date-time" },
    nightlyRateSnapshot: { type: "string", nullable: true },
    baseNightlyRateSnapshot: { type: "string", nullable: true },
    guestCount: { type: "integer", nullable: true },
    notes: { type: "string", nullable: true },
    nights: { type: "integer" },
    estimatedAmount: { type: "number" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const groupReservationDetailResponseSchema = {
  type: "object",
  required: [
    "groupCode",
    "leadGuestName",
    "totalRooms",
    "checkedInRooms",
    "arrivingRooms",
    "totalEstimatedAmount",
    "reservations",
  ],
  properties: {
    groupCode: { type: "string" },
    groupName: { type: "string", nullable: true },
    leadGuestName: { type: "string" },
    leadGuestPhone: { type: "string", nullable: true },
    notes: { type: "string", nullable: true },
    sourceCategory: { type: "string", nullable: true },
    sourcePartnerId: { type: "string", nullable: true },
    sourcePartnerName: { type: "string", nullable: true },
    totalRooms: { type: "integer" },
    checkedInRooms: { type: "integer" },
    arrivingRooms: { type: "integer" },
    totalEstimatedAmount: { type: "number" },
    reservations: {
      type: "array",
      items: groupReservationItemSchema,
    },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
};

const nightlyRateSwaggerSchema = {
  oneOf: [
    { type: "number", minimum: 0, maximum: 999_999_999_999.99, nullable: true },
    { type: "string", minLength: 1 },
  ],
};

const reservationChargeLineSwaggerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["lineType", "nameSnapshot", "unitPriceSnapshot", "totalSnapshot"],
  properties: {
    lineType: { type: "string", enum: ["ROOM_NIGHT", "EXTRA"] },
    serviceDate: { type: "string" },
    serviceItemId: { type: "string" },
    nameSnapshot: { type: "string", minLength: 1, maxLength: 160 },
    codeSnapshot: { type: "string", maxLength: 80 },
    quantity: { type: "integer", minimum: 1, default: 1 },
    unitPriceSnapshot: { type: "number", minimum: 0 },
    taxAmountSnapshot: { type: "number", minimum: 0, default: 0 },
    discountAmountSnapshot: { type: "number", minimum: 0, default: 0 },
    totalSnapshot: { type: "number", minimum: 0 },
    currency: { type: "string", maxLength: 3, default: "VND" },
  },
};

const bulkAllocationSwaggerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["roomTypeId", "quantity"],
  properties: {
    roomTypeId: { type: "string", minLength: 1 },
    quantity: { type: "integer", minimum: 1, maximum: 50 },
    rate: nightlyRateSwaggerSchema,
    nightlyRateSnapshot: nightlyRateSwaggerSchema,
  },
};

const createReservationBodySwaggerSchema = {
  type: "object",
  additionalProperties: false,
  required: ["guestDisplayName", "plannedCheckInAt", "plannedCheckOutAt"],
  properties: {
    guestDisplayName: { type: "string", minLength: 2, maxLength: 120 },
    guestPhone: { type: "string", maxLength: 40 },
    plannedCheckInAt: { type: "string", format: "date-time" },
    plannedCheckOutAt: { type: "string", format: "date-time" },
    roomId: { type: "string", minLength: 1, nullable: true },
    roomTypeId: { type: "string", minLength: 1 },
    autoAssign: { type: "boolean" },
    guestCount: { type: "integer", minimum: 1, maximum: 50 },
    notes: { type: "string", maxLength: 500 },
    rate: nightlyRateSwaggerSchema,
    nightlyRateSnapshot: nightlyRateSwaggerSchema,
    chargeLines: { type: "array", items: reservationChargeLineSwaggerSchema },
    sourceCategory: {
      type: "string",
      enum: ["DIRECT", "OTA", "TA", "TRAVEL_AGENCY", "CORPORATE", "OTHER"],
    },
    sourcePartnerId: { type: "string", minLength: 1, nullable: true },
    bookingOwnerUserId: { type: "string", minLength: 1, nullable: true },
  },
};

const bulkReservationSwaggerProperties = {
  leadGuestName: { type: "string", minLength: 2, maxLength: 120 },
  guestDisplayName: { type: "string", minLength: 2, maxLength: 120 },
  leadGuestPhone: { type: "string", maxLength: 40 },
  guestPhone: { type: "string", maxLength: 40 },
  checkInDate: { type: "string", description: "Ngày nhận phòng theo ISO hoặc thời điểm ISO 8601." },
  checkOutDate: { type: "string", description: "Ngày trả phòng theo ISO hoặc thời điểm ISO 8601." },
  plannedCheckInAt: { type: "string", description: "Ngày nhận phòng theo ISO hoặc thời điểm ISO 8601." },
  plannedCheckOutAt: { type: "string", description: "Ngày trả phòng theo ISO hoặc thời điểm ISO 8601." },
  roomIds: {
    type: "array",
    items: { type: "string", minLength: 1 },
    minItems: 1,
    maxItems: 50,
    uniqueItems: true,
  },
  allocations: {
    type: "array",
    items: bulkAllocationSwaggerSchema,
    minItems: 1,
    maxItems: 20,
  },
  autoAssign: { type: "boolean" },
  groupCode: { type: "string", maxLength: 80 },
  groupName: { type: "string", maxLength: 120 },
  notes: { type: "string" },
  idempotencyKey: { type: "string", maxLength: 120 },
  rate: nightlyRateSwaggerSchema,
  nightlyRateSnapshot: nightlyRateSwaggerSchema,
  roomRates: { type: "object", additionalProperties: nightlyRateSwaggerSchema },
  chargeLines: { type: "array", items: reservationChargeLineSwaggerSchema },
  sourceCategory: {
    type: "string",
    enum: ["DIRECT", "OTA", "TA", "TRAVEL_AGENCY", "CORPORATE", "OTHER"],
  },
  sourcePartnerId: { type: "string", minLength: 1, nullable: true },
  bookingOwnerUserId: { type: "string", minLength: 1, nullable: true },
};

const createBulkReservationsBodySwaggerSchema: Record<string, any> = {
  type: "object",
  additionalProperties: false,
  properties: bulkReservationSwaggerProperties,
  allOf: [
    {
      anyOf: [
        {
          required: ["leadGuestName"],
          properties: { leadGuestName: bulkReservationSwaggerProperties.leadGuestName },
        },
        {
          required: ["guestDisplayName"],
          properties: { guestDisplayName: bulkReservationSwaggerProperties.guestDisplayName },
        },
      ],
    },
    {
      anyOf: [
        {
          required: ["checkInDate"],
          properties: { checkInDate: bulkReservationSwaggerProperties.checkInDate },
        },
        {
          required: ["plannedCheckInAt"],
          properties: { plannedCheckInAt: bulkReservationSwaggerProperties.plannedCheckInAt },
        },
      ],
    },
    {
      anyOf: [
        {
          required: ["checkOutDate"],
          properties: { checkOutDate: bulkReservationSwaggerProperties.checkOutDate },
        },
        {
          required: ["plannedCheckOutAt"],
          properties: { plannedCheckOutAt: bulkReservationSwaggerProperties.plannedCheckOutAt },
        },
      ],
    },
    {
      anyOf: [
        {
          required: ["roomIds"],
          properties: { roomIds: bulkReservationSwaggerProperties.roomIds },
        },
        {
          required: ["allocations"],
          properties: { allocations: bulkReservationSwaggerProperties.allocations },
        },
      ],
    },
  ],
};

const bulkReservationResponseSchema = {
  type: "object",
  required: ["groupCode", "reservations"],
  properties: {
    groupCode: { type: "string" },
    reservations: { type: "array", items: reservationResponseSchema },
  },
};

@ApiTags("hotel-reservations")
@Controller("hotels")
export class ReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @RequirePermission("hotel.reservations.manage")
  @SuccessMessage("Tạo đặt phòng thành công")
  @ApiDescript("Tạo đặt phòng chưa cần gán phòng")
  @ApiParam({ name: "hotelId", type: String })
  @ApiBody({
    schema: createReservationBodySwaggerSchema,
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

  @RequirePermission("hotel.reservations.view")
  @SuccessMessage("Lấy danh sách khách đặt trước thành công")
  @ApiDescript("Danh sách khách đặt trước theo khoảng thời gian")
  @ApiParam({ name: "hotelId", type: String })
  @ApiQuery({ name: "from", required: true, type: String })
  @ApiQuery({ name: "to", required: true, type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "q", required: false, type: String })
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

  @RequirePermission("hotel.reservations.manage")
  @SuccessMessage("Gán phòng cho đặt phòng thành công")
  @ApiDescript("Gán phòng sẵn sàng và không trùng lịch")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "reservationId", type: String })
  @ApiBody({
    schema: {
      type: "object",
      required: ["roomId"],
      properties: {
        roomId: { type: "string" },
        rate: { type: "string", nullable: true },
        nightlyRateSnapshot: { type: "string", nullable: true },
        expectedUpdatedAt: { type: "string" },
        expectedRoomId: { type: "string", nullable: true },
      },
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

  @RequirePermission("hotel.stays.check-in")
  @SuccessMessage("Check-in đặt phòng thành công")
  @ApiDescript("Tạo stay và folio theo transaction")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "reservationId", type: String })
  @ApiBody({
    required: false,
    schema: {
      type: "object",
      properties: {
        guestDisplayName: { type: "string" },
        guestPhone: { type: "string" },
        guestIdentityNumber: { type: "string" },
        guestDateOfBirth: { type: "string" },
        guestGender: { type: "string" },
        guestNationality: { type: "string" },
        guestResidencePlace: { type: "string" },
        plannedCheckOutAt: { type: "string", format: "date-time" },
        occupants: { type: "array", items: { type: "object" } },
        allowEarlyCheckIn: { type: "boolean" },
        allowLateCheckIn: { type: "boolean" },
        confirmEarlyCheckIn: { type: "boolean" },
        confirmLateCheckIn: { type: "boolean" },
        expectedUpdatedAt: { type: "string" },
        expectedRoomId: { type: "string", nullable: true },
      },
    },
  })
  @ApiOkResponse({
    description: "Đặt phòng đã được check-in",
    schema: checkInResponseSchema,
  })
  @Post(":hotelId/reservations/:reservationId/check-in")
  async checkIn(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("reservationId") reservationIdParam: string,
    @Body() body?: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const reservationId = parseWithZod(reservationIdParamSchema, reservationIdParam);
    const dto = parseWithZod(checkInReservationBodySchema, body ?? {});
    return this.reservationsService.checkIn(
      request.user.userId,
      request.user.roleId,
      hotelId,
      reservationId,
      dto,
    );
  }

  @RequirePermission("hotel.reservations.manage")
  @SuccessMessage("Hủy đặt phòng thành công")
  @ApiDescript("Hủy đặt phòng và giải phóng phòng đã gán")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "reservationId", type: String })
  @ApiBody({
    required: false,
    schema: {
      type: "object",
      properties: {
        reason: { type: "string" },
      },
    },
  })
  @ApiOkResponse({
    description: "Đã hủy đặt phòng và giải phóng gán phòng",
    schema: reservationResponseSchema,
  })
  @Post(":hotelId/reservations/:reservationId/cancel")
  async cancelReservation(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("reservationId") reservationIdParam: string,
    @Body() body?: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const reservationId = parseWithZod(reservationIdParamSchema, reservationIdParam);
    const dto = parseWithZod(cancelReservationBodySchema, body ?? {});
    return this.reservationsService.cancelReservation(
      request.user.userId,
      request.user.roleId,
      hotelId,
      reservationId,
      dto,
    );
  }

  @RequirePermission("hotel.reservations.manage")
  @SuccessMessage("Báo vắng mặt (No-show) thành công")
  @ApiDescript("Đánh dấu khách không đến nhận phòng và giải phóng phòng đã gán")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "reservationId", type: String })
  @ApiBody({
    required: false,
    schema: {
      type: "object",
      properties: {
        reason: { type: "string" },
      },
    },
  })
  @ApiOkResponse({
    description: "Đã đánh dấu khách vắng mặt (No-show) và giải phóng phòng",
    schema: reservationResponseSchema,
  })
  @Post(":hotelId/reservations/:reservationId/no-show")
  async markNoShow(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("reservationId") reservationIdParam: string,
    @Body() body?: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const reservationId = parseWithZod(reservationIdParamSchema, reservationIdParam);
    const dto = parseWithZod(markNoShowBodySchema, body ?? {});
    return this.reservationsService.markNoShow(
      request.user.userId,
      request.user.roleId,
      hotelId,
      reservationId,
      dto,
    );
  }

  @RequirePermission("hotel.reservations.manage")
  @SuccessMessage("Tạo đặt phòng theo đoàn thành công")
  @ApiDescript(
    "Tạo danh sách đặt phòng theo đoàn (1–50 phòng) với 1 groupCode chung và các reservation riêng biệt",
  )
  @ApiParam({ name: "hotelId", type: String })
  @ApiBody({
    schema: createBulkReservationsBodySwaggerSchema as any,
  })
  @ApiCreatedResponse({
    description: "Đã tạo nhóm đặt phòng với groupCode và danh sách reservation",
    schema: bulkReservationResponseSchema,
  })
  @Post(":hotelId/reservations/bulk")
  async createBulkReservations(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const dto = parseWithZod(createBulkReservationsBodySchema, body);
    return this.reservationsService.createBulkReservations(
      request.user.userId,
      request.user.roleId,
      hotelId,
      dto,
    );
  }

  @RequirePermission("hotel.reservations.manage")
  @SuccessMessage("Tạo đặt phòng theo đoàn thành công")
  @ApiDescript(
    "Tạo danh sách đặt phòng theo đoàn (1–50 phòng) với 1 groupCode chung và các reservation riêng biệt",
  )
  @ApiParam({ name: "hotelId", type: String })
  @RequirePermission(["hotel.reservations.view", "hotel.reservations.manage"])
  @SuccessMessage("Lấy kế hoạch phòng thành công")
  @ApiDescript("Kế hoạch phòng trong khoảng thời gian tối đa 31 ngày")
  @ApiParam({ name: "hotelId", type: String })
  @ApiQuery({ name: "from", required: true, type: String })
  @ApiQuery({ name: "to", required: true, type: String })
  @ApiOkResponse({
    description: "Đã lấy kế hoạch phòng",
  })
  @Get(":hotelId/room-plan")
  async getRoomPlan(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const dto = parseWithZod(roomPlanQuerySchema, query);
    return this.reservationsService.getRoomPlan(
      request.user.userId,
      request.user.roleId,
      hotelId,
      dto,
    );
  }

  @RequirePermission("hotel.reservations.manage")
  @SuccessMessage("Cập nhật vị trí đặt phòng thành công")
  @ApiDescript("Chuyển hoặc tráo phòng cho đặt phòng cùng loại")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "reservationId", type: String })
  @ApiBody({
    schema: {
      type: "object",
      required: ["targetRoomId", "expectedUpdatedAt"],
      properties: {
        targetRoomId: { type: "string" },
        expectedUpdatedAt: { type: "string" },
        swapWithReservationId: { type: "string" },
        swapExpectedUpdatedAt: { type: "string" },
      },
    },
  })
  @ApiOkResponse({
    description: "Đã cập nhật vị trí đặt phòng",
  })
  @Put(":hotelId/reservations/:reservationId/placement")
  async updateReservationPlacement(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("reservationId") reservationIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const reservationId = parseWithZod(reservationIdParamSchema, reservationIdParam);
    const dto = parseWithZod(updateReservationPlacementBodySchema, body);
    return this.reservationsService.updateReservationPlacement(
      request.user.userId,
      request.user.roleId,
      hotelId,
      reservationId,
      dto,
    );
  }

  @RequirePermission("hotel.reservations.manage")
  @SuccessMessage("Cập nhật ngày đặt phòng thành công")
  @ApiDescript("Điều chỉnh ngày nhận/trả phòng của đơn đặt")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "reservationId", type: String })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        startDate: { type: "string", example: "2026-10-22" },
        endDate: { type: "string", example: "2026-10-25" },
        plannedCheckInAt: { type: "string", format: "date-time" },
        plannedCheckOutAt: { type: "string", format: "date-time" },
        expectedUpdatedAt: { type: "string" },
      },
      required: ["expectedUpdatedAt"],
    },
  })
  @Patch(":hotelId/reservations/:reservationId/dates")
  async updateReservationDates(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("reservationId") reservationIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const reservationId = parseWithZod(reservationIdParamSchema, reservationIdParam);
    const dto = parseWithZod(updateReservationDatesBodySchema, body);
    return this.reservationsService.updateReservationDates(
      request.user.userId,
      request.user.roleId,
      hotelId,
      reservationId,
      dto,
    );
  }

  @RequirePermission("hotel.reservations.manage")
  @SuccessMessage("Cập nhật thông tin đặt phòng thành công")
  @ApiDescript("Chỉnh sửa thông tin khách, ngày lưu trú, phòng phân bổ, đơn giá và ghi chú của đơn đặt")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "reservationId", type: String })
  @Patch(":hotelId/reservations/:reservationId")
  async updateReservation(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("reservationId") reservationIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const reservationId = parseWithZod(reservationIdParamSchema, reservationIdParam);
    const dto = parseWithZod(updateReservationBodySchema, body);
    return this.reservationsService.updateReservation(
      request.user.userId,
      request.user.roleId,
      hotelId,
      reservationId,
      dto,
    );
  }

  @RequirePermission(["hotel.reservations.view", "hotel.reservations.manage"])
  @SuccessMessage("Lấy chi tiết đơn đặt phòng thành công")
  @ApiDescript("Lấy chi tiết đơn đặt phòng cùng phòng và biểu phí chi tiết")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "reservationId", type: String })
  @Get(":hotelId/reservations/:reservationId")
  async getReservation(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("reservationId") reservationIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const reservationId = parseWithZod(reservationIdParamSchema, reservationIdParam);
    return this.reservationsService.getReservation(
      request.user.userId,
      request.user.roleId,
      hotelId,
      reservationId,
    );
  }

  @RequirePermission("hotel.reservations.manage")
  @SuccessMessage("Tạo đặt phòng theo đoàn thành công")
  @ApiDescript(
    "Tạo danh sách đặt phòng theo đoàn (1–50 phòng) với 1 groupCode chung và các reservation riêng biệt",
  )
  @ApiParam({ name: "hotelId", type: String })
  @ApiBody({
    schema: createBulkReservationsBodySwaggerSchema as any,
  })
  @ApiCreatedResponse({
    description: "Đã tạo nhóm đặt phòng với groupCode và danh sách reservation",
    schema: bulkReservationResponseSchema,
  })
  @Post(":hotelId/reservations/group")
  async createGroupReservations(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    return this.createBulkReservations(request, hotelIdParam, body);
  }

  @RequirePermission(["hotel.reservations.view", "hotel.reservations.manage"])
  @SuccessMessage("Lấy phiếu xác nhận đoàn thành công")
  @ApiDescript("Lấy phiếu xác nhận đặt phòng theo đoàn bao gồm thông tin đoàn và từng phòng")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "groupCode", type: String })
  @ApiOkResponse({
    description: "Đã lấy phiếu xác nhận đặt phòng theo đoàn",
  })
  @Get(":hotelId/reservations/groups/:groupCode/confirmation")
  async getGroupConfirmation(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("groupCode") groupCodeParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const groupCode = parseWithZod(groupCodeParamSchema, groupCodeParam);
    return this.reservationsService.getGroupConfirmation(
      request.user.userId,
      request.user.roleId,
      hotelId,
      groupCode,
    );
  }

  @RequirePermission(["hotel.reservations.view", "hotel.reservations.manage"])
  @SuccessMessage("Lấy thông tin nhóm đoàn thành công")
  @ApiDescript("Chi tiết nhóm đoàn và danh sách toàn bộ phòng trong đoàn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "groupCode", type: String })
  @ApiOkResponse({
    description: "Đã lấy thông tin chi tiết nhóm đoàn",
    schema: groupReservationDetailResponseSchema,
  })
  @Get(":hotelId/reservations/groups/:groupCode")
  async getGroupReservation(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("groupCode") groupCodeParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const groupCode = parseWithZod(groupCodeParamSchema, groupCodeParam);
    return this.reservationsService.getGroupReservation(
      request.user.userId,
      request.user.roleId,
      hotelId,
      groupCode,
    );
  }

  @RequirePermission("hotel.reservations.manage")
  @SuccessMessage("Cập nhật thông tin đoàn thành công")
  @ApiDescript("Cập nhật tên đoàn, thông tin liên lạc trưởng đoàn, ghi chú của đoàn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "groupCode", type: String })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        groupName: { type: "string", nullable: true },
        leadGuestName: { type: "string" },
        leadGuestPhone: { type: "string", nullable: true },
        notes: { type: "string", nullable: true },
      },
    },
  })
  @ApiOkResponse({
    description: "Đã cập nhật thông tin đoàn",
    schema: groupReservationDetailResponseSchema,
  })
  @Patch(":hotelId/reservations/groups/:groupCode")
  async updateGroupReservation(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("groupCode") groupCodeParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const groupCode = parseWithZod(groupCodeParamSchema, groupCodeParam);
    const dto = parseWithZod(updateGroupReservationBodySchema, body);
    return this.reservationsService.updateGroupReservation(
      request.user.userId,
      request.user.roleId,
      hotelId,
      groupCode,
      dto,
    );
  }

  @RequirePermission(["hotel.reservations.view", "hotel.reservations.manage"])
  @SuccessMessage("Lấy mẫu xác nhận đặt phòng của khách sạn thành công")
  @ApiDescript("Lấy mẫu xác nhận đặt phòng tùy chỉnh của khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiOkResponse({
    description: "Đã lấy cấu hình mẫu xác nhận đặt phòng",
  })
  @Get(":hotelId/reservations/confirmation-template")
  async getConfirmationTemplate(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    return this.reservationsService.getConfirmationTemplate(
      request.user.userId,
      request.user.roleId,
      hotelId,
    );
  }

  @RequirePermission("hotel.reservations.manage")
  @SuccessMessage("Cập nhật mẫu xác nhận đặt phòng thành công")
  @ApiDescript("Cập nhật cấu hình mẫu xác nhận đặt phòng tùy chỉnh của khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiOkResponse({
    description: "Đã cập nhật cấu hình mẫu xác nhận đặt phòng",
  })
  @Put(":hotelId/reservations/confirmation-template")
  async upsertConfirmationTemplate(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const dto = parseWithZod(upsertConfirmationTemplateBodySchema, body);
    return this.reservationsService.upsertConfirmationTemplate(
      request.user.userId,
      request.user.roleId,
      hotelId,
      dto,
    );
  }

  @RequirePermission(["hotel.reservations.view", "hotel.reservations.manage"])
  @SuccessMessage("Lấy phiếu xác nhận đặt phòng thành công")
  @ApiDescript("Lấy phiếu xác nhận đặt phòng chuẩn bao gồm thông tin khách sạn, chi tiết đêm phòng và thanh toán")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({
    description: "Đã lấy phiếu xác nhận đặt phòng",
  })
  @Get(":hotelId/reservations/:id/confirmation")
  async getReservationConfirmation(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("id") idParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const reservationId = parseWithZod(reservationIdParamSchema, idParam);
    return this.reservationsService.getReservationConfirmation(
      request.user.userId,
      request.user.roleId,
      hotelId,
      reservationId,
    );
  }

  @SuccessMessage("Lấy danh sách đối tác nguồn đặt phòng thành công")
  @ApiDescript("Lấy danh sách đối tác nguồn đặt phòng của khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @Get(":hotelId/booking-partners")
  @RequirePermission("hotel.reservations.view")
  async listBookingPartners(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() queryParams: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const query = parseWithZod(listBookingSourcePartnersQuerySchema, queryParams);
    return this.reservationsService.listBookingSourcePartners(
      request.user.userId,
      request.user.roleId,
      hotelId,
      query,
    );
  }

  @SuccessMessage("Tạo mới đối tác nguồn đặt phòng thành công")
  @ApiDescript("Tạo mới đối tác nguồn đặt phòng của khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @Post(":hotelId/booking-partners")
  @RequirePermission(["hotel.booking-partners.manage", "hotel.reservations.manage"])
  async createBookingPartner(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const dto = parseWithZod(createBookingSourcePartnerBodySchema, body);
    return this.reservationsService.createBookingSourcePartner(
      request.user.userId,
      request.user.roleId,
      hotelId,
      dto,
    );
  }

  @SuccessMessage("Cập nhật đối tác nguồn đặt phòng thành công")
  @ApiDescript("Cập nhật đối tác nguồn đặt phòng của khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "partnerId", type: String })
  @Patch(":hotelId/booking-partners/:partnerId")
  @RequirePermission(["hotel.booking-partners.manage", "hotel.reservations.manage"])
  async updateBookingPartner(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("partnerId") partnerIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const dto = parseWithZod(updateBookingSourcePartnerBodySchema, body);
    return this.reservationsService.updateBookingSourcePartner(
      request.user.userId,
      request.user.roleId,
      hotelId,
      partnerIdParam,
      dto,
    );
  }

  @SuccessMessage("Xóa đối tác nguồn đặt phòng thành công")
  @ApiDescript("Xóa đối tác nguồn đặt phòng của khách sạn")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "partnerId", type: String })
  @Delete(":hotelId/booking-partners/:partnerId")
  @RequirePermission(["hotel.booking-partners.manage", "hotel.reservations.manage"])
  async deleteBookingPartner(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("partnerId") partnerIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    return this.reservationsService.deleteBookingSourcePartner(
      request.user.userId,
      request.user.roleId,
      hotelId,
      partnerIdParam,
    );
  }
}

import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
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
import { HotelRoomsService } from "../application/hotel-rooms.service";
import {
  checkOutBodySchema,
  createRoomBodySchema,
  createRoomsBodySchema,
  createStayBodySchema,
  listRoomsQuerySchema,
  qrReasonBodySchema,
  updateRoomBodySchema,
} from "../domain/schemas/rooms.schema";
import {
  hotelIdParamSchema,
  roomIdParamSchema,
  stayIdParamSchema,
} from "../domain/schemas/shared.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("hotel-rooms")
@Controller("hotels")
export class HotelRoomsController {
  constructor(private readonly hotelRoomsService: HotelRoomsService) {}

  @SuccessMessage("Tạo phòng thành công")
  @RequirePermission("hotel.rooms.manage")
  @ApiDescript("Tạo phòng")
  @ApiParam({ name: "hotelId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiCreatedResponse({ description: "Đã tạo phòng" })
  @Post(":hotelId/rooms")
  async createRoom(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const dto = parseWithZod(createRoomBodySchema, body);
    return this.hotelRoomsService.createRoom(
      request.user.userId,
      request.user.roleId,
      hotelId,
      dto,
    );
  }

  @SuccessMessage("Tạo danh sách phòng thành công")
  @RequirePermission("hotel.rooms.manage")
  @ApiDescript("Tạo nhiều phòng")
  @ApiParam({ name: "hotelId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiCreatedResponse({ description: "Đã tạo danh sách phòng" })
  @Post(":hotelId/rooms/bulk")
  async createRooms(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const dto = parseWithZod(createRoomsBodySchema, body);
    return this.hotelRoomsService.createRooms(
      request.user.userId,
      request.user.roleId,
      hotelId,
      dto,
    );
  }

  @SuccessMessage("Lấy danh sách phòng thành công")
  @RequirePermission("hotel.rooms.view")
  @ApiDescript("Xem danh sách phòng")
  @ApiParam({ name: "hotelId", type: String })
  @ApiQuery({ name: "status", required: false, type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiOkResponse({ description: "Đã lấy danh sách phòng" })
  @Get(":hotelId/rooms")
  async listRooms(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const parsedQuery = parseWithZod(listRoomsQuerySchema, query);
    return this.hotelRoomsService.listRooms(
      request.user.userId,
      request.user.roleId,
      hotelId,
      parsedQuery,
    );
  }

  @SuccessMessage("Cập nhật phòng thành công")
  @RequirePermission("hotel.rooms.manage")
  @ApiDescript("Cập nhật phòng")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "roomId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiOkResponse({ description: "Đã cập nhật phòng" })
  @Patch(":hotelId/rooms/:roomId")
  async updateRoom(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("roomId") roomIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const roomId = parseWithZod(roomIdParamSchema, roomIdParam);
    const dto = parseWithZod(updateRoomBodySchema, body);
    return this.hotelRoomsService.updateRoom(
      request.user.userId,
      request.user.roleId,
      hotelId,
      roomId,
      dto,
    );
  }

  @SuccessMessage("Tạo lượt lưu trú thành công")
  @RequirePermission("hotel.stays.manage")
  @ApiDescript("Tạo khách lưu trú")
  @ApiParam({ name: "hotelId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiCreatedResponse({ description: "Đã tạo lượt lưu trú" })
  @Post(":hotelId/stays")
  async createStay(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const dto = parseWithZod(createStayBodySchema, body);
    return this.hotelRoomsService.createStay(
      request.user.userId,
      request.user.roleId,
      hotelId,
      dto,
    );
  }

  @SuccessMessage("Check-in lượt lưu trú thành công")
  @RequirePermission("hotel.stays.manage")
  @ApiDescript("Check-in khách")
  @ApiParam({ name: "hotelId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiCreatedResponse({ description: "Đã tạo và check-in lượt lưu trú" })
  @Post(":hotelId/stays/check-in")
  async createAndCheckInStay(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const dto = parseWithZod(createStayBodySchema, body);
    return this.hotelRoomsService.createAndCheckInStay(
      request.user.userId,
      request.user.roleId,
      hotelId,
      dto,
    );
  }

  @SuccessMessage("Check-in lượt lưu trú thành công")
  @RequirePermission("hotel.stays.manage")
  @ApiDescript("Check-in khách")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "stayId", type: String })
  @ApiOkResponse({ description: "Đã check-in lượt lưu trú" })
  @Post(":hotelId/stays/:stayId/check-in")
  async checkInStay(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("stayId") stayIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const stayId = parseWithZod(stayIdParamSchema, stayIdParam);
    return this.hotelRoomsService.checkInStay(
      request.user.userId,
      request.user.roleId,
      hotelId,
      stayId,
    );
  }

  @SuccessMessage("Check-out lượt lưu trú thành công")
  @RequirePermission("hotel.stays.manage")
  @ApiDescript("Check-out khách")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "stayId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiOkResponse({ description: "Đã check-out lượt lưu trú" })
  @Post(":hotelId/stays/:stayId/check-out")
  async checkOutStay(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("stayId") stayIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const stayId = parseWithZod(stayIdParamSchema, stayIdParam);
    const dto = parseWithZod(checkOutBodySchema, body ?? {});
    return this.hotelRoomsService.checkOutStay(
      request.user.userId,
      request.user.roleId,
      hotelId,
      stayId,
      dto,
    );
  }

  @SuccessMessage("Xoay mã QR phòng thành công")
  @RequirePermission("hotel.rooms.qr.manage")
  @ApiDescript("Quản lý mã QR")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "roomId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiOkResponse({ description: "Đã xoay mã QR phòng" })
  @Post(":hotelId/rooms/:roomId/qr/rotate")
  async rotateQr(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("roomId") roomIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const roomId = parseWithZod(roomIdParamSchema, roomIdParam);
    const dto = parseWithZod(qrReasonBodySchema, body ?? {});
    return this.hotelRoomsService.rotateQr(
      request.user.userId,
      request.user.roleId,
      hotelId,
      roomId,
      dto,
    );
  }

  @SuccessMessage("Kích hoạt mã QR phòng thành công")
  @RequirePermission("hotel.rooms.qr.manage")
  @ApiDescript("Kích hoạt mã QR")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "roomId", type: String })
  @ApiOkResponse({ description: "Đã kích hoạt mã QR phòng" })
  @Post(":hotelId/rooms/:roomId/qr/activate")
  async activateQr(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("roomId") roomIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const roomId = parseWithZod(roomIdParamSchema, roomIdParam);
    return this.hotelRoomsService.activateQr(
      request.user.userId,
      request.user.roleId,
      hotelId,
      roomId,
    );
  }

  @SuccessMessage("Hủy kích hoạt mã QR phòng thành công")
  @RequirePermission("hotel.rooms.qr.manage")
  @ApiDescript("Tạm ngừng mã QR")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "roomId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiOkResponse({ description: "Đã hủy kích hoạt mã QR phòng" })
  @Post(":hotelId/rooms/:roomId/qr/deactivate")
  async deactivateQr(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("roomId") roomIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const roomId = parseWithZod(roomIdParamSchema, roomIdParam);
    const dto = parseWithZod(qrReasonBodySchema, body ?? {});
    return this.hotelRoomsService.deactivateQr(
      request.user.userId,
      request.user.roleId,
      hotelId,
      roomId,
      dto,
    );
  }
}

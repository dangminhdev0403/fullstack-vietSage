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
import { parseWithZod } from "../../common/validation/parse-with-zod";
import { ApiDescript } from "../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../shared/security";
import { HotelRoomsService } from "./hotel-rooms.service";
import {
  checkOutBodySchema,
  createRoomBodySchema,
  createRoomsBodySchema,
  createStayBodySchema,
  listRoomsQuerySchema,
  qrReasonBodySchema,
  updateRoomBodySchema,
} from "./schemas/rooms.schema";
import { hotelIdParamSchema, roomIdParamSchema, stayIdParamSchema } from "./schemas/shared.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("hotel-rooms")
@Controller("hotels")
export class HotelRoomsController {
  constructor(private readonly hotelRoomsService: HotelRoomsService) {}

  @SuccessMessage("Tạo phòng thành công")
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
    return this.hotelRoomsService.createRoom(request.user.userId, hotelId, dto);
  }

  @SuccessMessage("Tạo danh sách phòng thành công")
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
    return this.hotelRoomsService.createRooms(request.user.userId, hotelId, dto);
  }

  @SuccessMessage("Lấy danh sách phòng thành công")
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
    return this.hotelRoomsService.listRooms(request.user.userId, hotelId, parsedQuery);
  }

  @SuccessMessage("Cập nhật phòng thành công")
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
    return this.hotelRoomsService.updateRoom(request.user.userId, hotelId, roomId, dto);
  }

  @SuccessMessage("Tạo lượt lưu trú thành công")
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
    return this.hotelRoomsService.createStay(request.user.userId, hotelId, dto);
  }

  @SuccessMessage("Check-in lượt lưu trú thành công")
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
    return this.hotelRoomsService.createAndCheckInStay(request.user.userId, hotelId, dto);
  }

  @SuccessMessage("Check-in lượt lưu trú thành công")
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
    return this.hotelRoomsService.checkInStay(request.user.userId, hotelId, stayId);
  }

  @SuccessMessage("Check-out lượt lưu trú thành công")
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
    return this.hotelRoomsService.checkOutStay(request.user.userId, hotelId, stayId, dto);
  }

  @SuccessMessage("Xoay mã QR phòng thành công")
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
    return this.hotelRoomsService.rotateQr(request.user.userId, hotelId, roomId, dto);
  }

  @SuccessMessage("Kích hoạt mã QR phòng thành công")
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
    return this.hotelRoomsService.activateQr(request.user.userId, hotelId, roomId);
  }

  @SuccessMessage("Hủy kích hoạt mã QR phòng thành công")
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
    return this.hotelRoomsService.deactivateQr(request.user.userId, hotelId, roomId, dto);
  }
}

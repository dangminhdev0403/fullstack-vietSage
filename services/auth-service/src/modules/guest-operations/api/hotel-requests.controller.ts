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
import { HotelRequestsService } from "../application/hotel-requests.service";
import { GuestMessagesService } from "../application/guest-messages.service";
import {
  createRequestEventBodySchema,
  guestRequestPriorityValues,
  listStaffRequestsQuerySchema,
  requestSummaryQuerySchema,
  updateRequestAssignmentBodySchema,
  updateRequestStatusBodySchema,
  hotelIdParamSchema,
  listHotelMessagesQuerySchema,
  messageThreadIdParamSchema,
  requestIdParamSchema,
  sendHotelMessageBodySchema,
} from "../domain/schemas/requests.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("hotel-requests")
@Controller("hotels")
export class HotelRequestsController {
  constructor(
    private readonly hotelRequestsService: HotelRequestsService,
    private readonly guestMessagesService: GuestMessagesService,
  ) {}

  @SuccessMessage("Lấy danh sách hội thoại phòng thành công")
  @RequirePermission("hotel.requests.view")
  @Get(":hotelId/messages")
  async listMessages(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const parsed = parseWithZod(listHotelMessagesQuerySchema, query);
    return this.guestMessagesService.listForHotel(
      request.user.userId,
      request.user.roleId,
      hotelId,
      parsed.limit ?? 30,
      parsed.q,
      parsed.cursor,
    );
  }

  @SuccessMessage("Lấy hội thoại phòng thành công")
  @RequirePermission("hotel.requests.view")
  @Get(":hotelId/messages/:threadId")
  async getMessageThread(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("threadId") threadIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const threadId = parseWithZod(messageThreadIdParamSchema, threadIdParam);
    const parsed = parseWithZod(listHotelMessagesQuerySchema, query);
    return this.guestMessagesService.getForHotel(
      request.user.userId,
      request.user.roleId,
      hotelId,
      threadId,
      parsed.page,
      parsed.limit ?? 20,
      parsed.before,
    );
  }

  @SuccessMessage("Đã gửi tin nhắn cho khách")
  @RequirePermission("hotel.requests.manage")
  @Post(":hotelId/messages/:threadId/reply")
  async replyMessage(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("threadId") threadIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const threadId = parseWithZod(messageThreadIdParamSchema, threadIdParam);
    const parsed = parseWithZod(sendHotelMessageBodySchema, body);
    return this.guestMessagesService.replyFromStaff(
      request.user.userId,
      request.user.roleId,
      hotelId,
      threadId,
      parsed.body,
    );
  }

  @SuccessMessage("Đã đánh dấu hội thoại là đã đọc")
  @RequirePermission("hotel.requests.manage")
  @Post(":hotelId/messages/:threadId/read")
  async markMessageThreadRead(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("threadId") threadIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const threadId = parseWithZod(messageThreadIdParamSchema, threadIdParam);
    return this.guestMessagesService.markReadForHotel(
      request.user.userId,
      request.user.roleId,
      hotelId,
      threadId,
    );
  }

  @SuccessMessage("Lấy danh sách yêu cầu của khách thành công")
  @RequirePermission("hotel.requests.view")
  @ApiDescript("Xem danh sách yêu cầu khách")
  @ApiParam({ name: "hotelId", type: String })
  @ApiOkResponse({ description: "Đã lấy danh sách yêu cầu của khách" })
  @ApiQuery({ name: "priority", required: false, enum: guestRequestPriorityValues })
  @Get(":hotelId/requests")
  async listRequests(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const parsedQuery = parseWithZod(listStaffRequestsQuerySchema, query);
    return this.hotelRequestsService.listRequests(
      request.user.userId,
      request.user.roleId,
      hotelId,
      parsedQuery,
    );
  }

  @SuccessMessage("Get guest request summary successfully")
  @RequirePermission("hotel.requests.view")
  @ApiDescript("Xem tổng quan yêu cầu khách")
  @ApiParam({ name: "hotelId", type: String })
  @ApiOkResponse({ description: "Guest request summary" })
  @Get(":hotelId/requests/summary")
  async getRequestsSummary(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const parsedQuery = parseWithZod(requestSummaryQuerySchema, query);
    return this.hotelRequestsService.getRequestsSummary(
      request.user.userId,
      request.user.roleId,
      hotelId,
      parsedQuery,
    );
  }

  @SuccessMessage("Lấy yêu cầu của khách thành công")
  @RequirePermission("hotel.requests.view")
  @ApiDescript("Xem chi tiết yêu cầu khách")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "requestId", type: String })
  @ApiOkResponse({ description: "Đã lấy yêu cầu của khách" })
  @Get(":hotelId/requests/:requestId")
  async getRequestDetail(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("requestId") requestIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const requestId = parseWithZod(requestIdParamSchema, requestIdParam);
    return this.hotelRequestsService.getRequestDetail(
      request.user.userId,
      request.user.roleId,
      hotelId,
      requestId,
    );
  }

  @SuccessMessage("Cập nhật yêu cầu của khách thành công")
  @RequirePermission("hotel.requests.manage")
  @ApiDescript("Cập nhật yêu cầu khách")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "requestId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiOkResponse({ description: "Đã cập nhật yêu cầu của khách" })
  @Patch(":hotelId/requests/:requestId/status")
  async updateRequestStatus(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("requestId") requestIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const requestId = parseWithZod(requestIdParamSchema, requestIdParam);
    const dto = parseWithZod(updateRequestStatusBodySchema, body);
    return this.hotelRequestsService.updateRequestStatus(
      request.user.userId,
      request.user.roleId,
      hotelId,
      requestId,
      dto,
    );
  }

  @SuccessMessage("Cập nhật phân công yêu cầu của khách thành công")
  @RequirePermission("hotel.requests.manage")
  @ApiDescript("Phân công yêu cầu khách")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "requestId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiOkResponse({ description: "Đã cập nhật phân công yêu cầu của khách" })
  @Patch(":hotelId/requests/:requestId/assignment")
  async updateRequestAssignment(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("requestId") requestIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const requestId = parseWithZod(requestIdParamSchema, requestIdParam);
    const dto = parseWithZod(updateRequestAssignmentBodySchema, body);
    return this.hotelRequestsService.updateRequestAssignment(
      request.user.userId,
      request.user.roleId,
      hotelId,
      requestId,
      dto,
    );
  }

  @SuccessMessage("Tạo sự kiện yêu cầu của khách thành công")
  @RequirePermission("hotel.requests.manage")
  @ApiDescript("Thêm ghi chú yêu cầu khách")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "requestId", type: String })
  @ApiBody({ schema: { type: "object" } })
  @ApiCreatedResponse({ description: "Đã tạo sự kiện yêu cầu của khách" })
  @Post(":hotelId/requests/:requestId/events")
  async createRequestEvent(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("requestId") requestIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const requestId = parseWithZod(requestIdParamSchema, requestIdParam);
    const dto = parseWithZod(createRequestEventBodySchema, body);
    return this.hotelRequestsService.createRequestEvent(
      request.user.userId,
      request.user.roleId,
      hotelId,
      requestId,
      dto,
    );
  }
}

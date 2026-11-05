import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
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
import { hotelIdParamSchema } from "../../property/domain/schemas/shared.schema";
import { HousekeepingService } from "../application/housekeeping.service";
import {
  blockHousekeepingTaskBodySchema,
  claimHousekeepingTaskBodySchema,
  completeHousekeepingTaskBodySchema,
  createHousekeepingTaskBodySchema,
  housekeepingNotificationStatusValues,
  housekeepingTaskPriorityValues,
  housekeepingTaskStatusValues,
  listHousekeepingNotificationsQuerySchema,
  listHousekeepingTasksQuerySchema,
  notificationIdParamSchema,
  reopenHousekeepingTaskBodySchema,
  startHousekeepingTaskBodySchema,
  taskIdParamSchema,
} from "../domain/schemas/housekeeping.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("housekeeping")
@Controller("hotels")
export class HousekeepingController {
  constructor(private readonly housekeepingService: HousekeepingService) {}

  @SuccessMessage("Lấy danh sách công việc buồng phòng thành công")
  @RequirePermission(["hotel.rooms.view", "hotel.rooms.ready.confirm"])
  @ApiDescript("Xem danh sách công việc buồng phòng")
  @ApiParam({ name: "hotelId", type: String })
  @ApiQuery({ name: "status", required: false, enum: housekeepingTaskStatusValues })
  @ApiQuery({ name: "priority", required: false, enum: housekeepingTaskPriorityValues })
  @ApiQuery({ name: "roomId", required: false, type: String })
  @ApiQuery({ name: "assignedToUserId", required: false, type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ description: "Danh sách công việc buồng phòng" })
  @Get(":hotelId/housekeeping/tasks")
  async listTasks(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const parsedQuery = parseWithZod(listHousekeepingTasksQuerySchema, query);
    return this.housekeepingService.listTasks(
      request.user.userId,
      request.user.roleId,
      hotelId,
      parsedQuery,
    );
  }

  @SuccessMessage("Lấy tổng quan công việc buồng phòng thành công")
  @RequirePermission(["hotel.rooms.view", "hotel.rooms.ready.confirm"])
  @ApiDescript("Xem tổng quan số lượng công việc buồng phòng")
  @ApiParam({ name: "hotelId", type: String })
  @ApiOkResponse({ description: "Tổng quan công việc buồng phòng" })
  @Get(":hotelId/housekeeping/tasks/summary")
  async getTasksSummary(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    return this.housekeepingService.getTasksSummary(
      request.user.userId,
      request.user.roleId,
      hotelId,
    );
  }

  @SuccessMessage("Lấy chi tiết công việc buồng phòng thành công")
  @RequirePermission(["hotel.rooms.view", "hotel.rooms.ready.confirm"])
  @ApiDescript("Xem chi tiết công việc buồng phòng kèm lịch sử")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "taskId", type: String })
  @ApiOkResponse({ description: "Chi tiết công việc buồng phòng" })
  @Get(":hotelId/housekeeping/tasks/:taskId")
  async getTaskDetail(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("taskId") taskIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const taskId = parseWithZod(taskIdParamSchema, taskIdParam);
    return this.housekeepingService.getTaskDetail(
      request.user.userId,
      request.user.roleId,
      hotelId,
      taskId,
    );
  }

  @SuccessMessage("Tạo công việc buồng phòng thành công")
  @RequirePermission(["hotel.rooms.ready.confirm", "hotel.rooms.status.manage", "hotel.rooms.manage"])
  @ApiDescript("Tạo công việc dọn phòng thủ công")
  @ApiParam({ name: "hotelId", type: String })
  @ApiBody({ schema: { type: "object", required: ["roomId"] } })
  @ApiCreatedResponse({ description: "Đã tạo công việc buồng phòng" })
  @Post(":hotelId/housekeeping/tasks")
  async createTask(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const dto = parseWithZod(createHousekeepingTaskBodySchema, body);
    return this.housekeepingService.createTask(
      request.user.userId,
      request.user.roleId,
      hotelId,
      dto,
    );
  }

  @SuccessMessage("Nhận công việc dọn phòng thành công")
  @RequirePermission(["hotel.rooms.ready.confirm", "hotel.rooms.status.manage", "hotel.rooms.manage"])
  @ApiDescript("Nhận công việc dọn phòng (chuyển sang CLAIMED)")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "taskId", type: String })
  @ApiBody({ schema: { type: "object", properties: { expectedVersion: { type: "integer" } } } })
  @ApiOkResponse({ description: "Đã nhận công việc dọn phòng" })
  @Post(":hotelId/housekeeping/tasks/:taskId/claim")
  async claimTask(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("taskId") taskIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const taskId = parseWithZod(taskIdParamSchema, taskIdParam);
    const dto = parseWithZod(claimHousekeepingTaskBodySchema, body ?? {});
    return this.housekeepingService.claimTask(
      request.user.userId,
      request.user.roleId,
      hotelId,
      taskId,
      dto,
    );
  }

  @SuccessMessage("Bắt đầu dọn phòng thành công")
  @RequirePermission(["hotel.rooms.ready.confirm", "hotel.rooms.status.manage", "hotel.rooms.manage"])
  @ApiDescript("Bắt đầu dọn phòng (chuyển sang IN_PROGRESS)")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "taskId", type: String })
  @ApiBody({ schema: { type: "object", properties: { expectedVersion: { type: "integer" } } } })
  @ApiOkResponse({ description: "Đã bắt đầu công việc dọn phòng" })
  @Post(":hotelId/housekeeping/tasks/:taskId/start")
  async startTask(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("taskId") taskIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const taskId = parseWithZod(taskIdParamSchema, taskIdParam);
    const dto = parseWithZod(startHousekeepingTaskBodySchema, body ?? {});
    return this.housekeepingService.startTask(
      request.user.userId,
      request.user.roleId,
      hotelId,
      taskId,
      dto,
    );
  }

  @SuccessMessage("Tạm dừng công việc dọn phòng thành công")
  @RequirePermission(["hotel.rooms.ready.confirm", "hotel.rooms.status.manage", "hotel.rooms.manage"])
  @ApiDescript("Tạm dừng công việc dọn phòng (chuyển sang BLOCKED kèm lý do)")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "taskId", type: String })
  @ApiBody({
    schema: {
      type: "object",
      required: ["reason"],
      properties: {
        reason: { type: "string" },
        notes: { type: "string" },
        expectedVersion: { type: "integer" },
      },
    },
  })
  @ApiOkResponse({ description: "Đã tạm dừng công việc dọn phòng" })
  @Post(":hotelId/housekeeping/tasks/:taskId/block")
  async blockTask(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("taskId") taskIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const taskId = parseWithZod(taskIdParamSchema, taskIdParam);
    const dto = parseWithZod(blockHousekeepingTaskBodySchema, body);
    return this.housekeepingService.blockTask(
      request.user.userId,
      request.user.roleId,
      hotelId,
      taskId,
      dto,
    );
  }

  @SuccessMessage("Hoàn thành công việc dọn phòng thành công")
  @RequirePermission(["hotel.rooms.ready.confirm", "hotel.rooms.status.manage", "hotel.rooms.manage"])
  @ApiDescript("Hoàn thành dọn phòng và cập nhật phòng sang SẴN SÀNG (AVAILABLE)")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "taskId", type: String })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        notes: { type: "string" },
        expectedVersion: { type: "integer" },
      },
    },
  })
  @ApiOkResponse({ description: "Đã hoàn thành công việc và cập nhật phòng AVAILABLE" })
  @Post(":hotelId/housekeeping/tasks/:taskId/complete")
  async completeTask(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("taskId") taskIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const taskId = parseWithZod(taskIdParamSchema, taskIdParam);
    const dto = parseWithZod(completeHousekeepingTaskBodySchema, body ?? {});
    return this.housekeepingService.completeTask(
      request.user.userId,
      request.user.roleId,
      hotelId,
      taskId,
      dto,
    );
  }

  @SuccessMessage("Mở lại công việc dọn phòng thành công")
  @RequirePermission(["hotel.rooms.ready.confirm", "hotel.rooms.status.manage", "hotel.rooms.manage"])
  @ApiDescript("Mở lại công việc từ BLOCKED hoặc COMPLETED")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "taskId", type: String })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        reason: { type: "string" },
        expectedVersion: { type: "integer" },
      },
    },
  })
  @ApiOkResponse({ description: "Đã mở lại công việc dọn phòng" })
  @Post(":hotelId/housekeeping/tasks/:taskId/reopen")
  async reopenTask(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("taskId") taskIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const taskId = parseWithZod(taskIdParamSchema, taskIdParam);
    const dto = parseWithZod(reopenHousekeepingTaskBodySchema, body ?? {});
    return this.housekeepingService.reopenTask(
      request.user.userId,
      request.user.roleId,
      hotelId,
      taskId,
      dto,
    );
  }

  @SuccessMessage("Lấy danh sách thông báo buồng phòng thành công")
  @RequirePermission(["hotel.rooms.view", "hotel.rooms.ready.confirm"])
  @ApiDescript("Xem danh sách thông báo buồng phòng")
  @ApiParam({ name: "hotelId", type: String })
  @ApiQuery({ name: "status", required: false, enum: housekeepingNotificationStatusValues })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiOkResponse({ description: "Danh sách thông báo buồng phòng" })
  @Get(":hotelId/housekeeping/notifications")
  async listNotifications(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const parsedQuery = parseWithZod(listHousekeepingNotificationsQuerySchema, query);
    return this.housekeepingService.listNotifications(
      request.user.userId,
      request.user.roleId,
      hotelId,
      parsedQuery,
    );
  }

  @SuccessMessage("Đánh dấu thông báo đã đọc thành công")
  @RequirePermission(["hotel.rooms.view", "hotel.rooms.ready.confirm"])
  @ApiDescript("Đánh dấu thông báo buồng phòng đã đọc")
  @ApiParam({ name: "hotelId", type: String })
  @ApiParam({ name: "notificationId", type: String })
  @ApiOkResponse({ description: "Đã đánh dấu thông báo đã đọc" })
  @Patch(":hotelId/housekeeping/notifications/:notificationId/read")
  async markNotificationRead(
    @Req() request: RequestWithUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("notificationId") notificationIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const notificationId = parseWithZod(notificationIdParamSchema, notificationIdParam);
    return this.housekeepingService.markNotificationRead(
      request.user.userId,
      request.user.roleId,
      hotelId,
      notificationId,
    );
  }
}

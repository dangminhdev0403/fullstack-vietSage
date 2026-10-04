import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  BadRequestException,
  Logger,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiHeader, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { RequestWithRequiredUser } from "../../../shared/security/request-with-authenticated-user";
import { HotelAccessService } from "../../property/property-public";
import {
  adminChannelOverviewQuerySchema,
  bulkUpdateRestrictionsSchema,
  channexCancelBookingSchema,
  channexChannelIdSchema,
  channexChannelSessionSchema,
  channexConfigurePropertySchema,
  channexCreateChannelSchema,
  channexPollFeedSchema,
  channexPrepareChannelSchema,
  channexPushAriSchema,
  channexRecoverSchema,
  channexSimulateBookingSchema,
  channexSyncContentSchema,
  channexUpdateChannelSchema,
  channexWebhookSchema,
  connectionIdParamSchema,
  createChannelConnectionSchema,
  hotelIdParamSchema,
  icalTokenParamSchema,
  inventoryQuerySchema,
  updateAvailabilitySchema,
  updateRestrictionsSchema,
} from "../domain/schemas/channel-manager.schema";
import { AriCoreService } from "../services/ari-core.service";
import { ChannelManagerAdminOverviewService } from "../services/channel-manager-admin-overview.service";
import { ChannelManagerAuditService } from "../services/channel-manager-audit.service";
import { ChannelManagerService } from "../services/channel-manager.service";
import { ChannexAriSyncService } from "../services/channex-ari-sync.service";
import { ChannexBookingIngestionService } from "../services/channex-booking-ingestion.service";
import { ChannexChannelSessionService } from "../services/channex-channel-session.service";
import { ChannexDoctorService } from "../services/channex-doctor.service";
import { ChannexSyncService } from "../services/channex-sync.service";
import { assertChannexWebhookSecret } from "../services/channex-webhook-auth";
import { IcalService } from "../services/ical.service";

@ApiTags("channel-manager")
@Controller("api/v1/channel-manager")
export class ChannelManagerController {
  constructor(
    private readonly channelManagerService: ChannelManagerService,
    private readonly ariCoreService: AriCoreService,
    private readonly icalService: IcalService,
    private readonly channexSyncService: ChannexSyncService,
    private readonly channexAriSyncService: ChannexAriSyncService,
    private readonly channexBookingIngestionService: ChannexBookingIngestionService,
    private readonly channexDoctorService: ChannexDoctorService,
    private readonly channexChannelSessionService: ChannexChannelSessionService,
    private readonly hotelAccessService: HotelAccessService,
    private readonly adminOverviewService: ChannelManagerAdminOverviewService,
    private readonly auditService: ChannelManagerAuditService,
  ) {}

  private readonly logger = new Logger(ChannelManagerController.name);

  private async assertAccess(req: RequestWithRequiredUser, hotelId: string): Promise<string> {
    await this.hotelAccessService.assertHotelAccess(req.user.userId, req.user.roleId, hotelId);
    return hotelId;
  }

  private triggerBackgroundChannexPush(hotelId: string, availabilityOnly = false) {
    setImmediate(() => {
      void this.channexAriSyncService
        .pushAri(hotelId, { availabilityOnly })
        .catch((err: unknown) => {
          this.logger.debug?.(
            `[AutoChannexPush] Hotel ${hotelId} push skipped or failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          );
        });
    });
  }

  @ApiDescript("Super Admin: Báo cáo tổng quan hạm đội kênh phân phối (Fleet Overview)")
  @RequirePermission("platform.hotels.view")
  @SuccessMessage("Lấy báo cáo tổng quan hạm đội kênh thành công")
  @Get("admin/overview")
  async getAdminOverview(@Query() query: unknown) {
    const q = parseWithZod(adminChannelOverviewQuerySchema, query);
    return this.adminOverviewService.getOverview(q);
  }

  @ApiDescript("Danh sách các kết nối kênh phân phối phòng của khách sạn")
  @RequirePermission(["hotel.channels.view", "platform.hotels.view"])
  @SuccessMessage("Lấy danh sách kết nối kênh thành công")
  @Get("hotels/:hotelId/connections")
  async getConnections(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    return this.channelManagerService.getConnections(hotelId);
  }

  @ApiDescript("Tạo kết nối kênh phân phối phòng mới (Airbnb, Booking.com, Agoda, Direct Booking)")
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Tạo kết nối kênh thành công")
  @Post("hotels/:hotelId/connections")
  async createConnection(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    const dto = parseWithZod(createChannelConnectionSchema, body);
    return this.channelManagerService.createConnection(hotelId, dto);
  }

  @ApiDescript("Xóa kết nối kênh phân phối phòng")
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Xóa kết nối kênh thành công")
  @Delete("hotels/:hotelId/connections/:id")
  async deleteConnection(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("id") idParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const id = parseWithZod(connectionIdParamSchema, idParam);
    await this.assertAccess(req, hotelId);
    return this.channelManagerService.deleteConnection(hotelId, id);
  }

  @ApiDescript("Xem bảng ma trận kho phòng (ARI Grid): tồn phòng, giá và hạn chế bán")
  @RequirePermission("hotel.rooms.view")
  @SuccessMessage("Lấy bảng tồn kho phòng thành công")
  @Get("hotels/:hotelId/inventory")
  async getInventory(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Query() query: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    const q = parseWithZod(inventoryQuerySchema, query);
    return this.ariCoreService.getInventoryGrid(hotelId, q.date_from, q.date_to, q.roomType);
  }

  @ApiDescript("Cập nhật giá và hạn chế bán (minStay, maxStay, stopSell, CTA, CTD) cho các ngày")
  @RequirePermission("hotel.rooms.manage")
  @SuccessMessage("Cập nhật giá và hạn chế bán thành công")
  @Post("hotels/:hotelId/inventory/restrictions")
  async updateRestrictions(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    const payload = parseWithZod(updateRestrictionsSchema, body);
    const result = await this.ariCoreService.updateRestrictions(hotelId, payload.items);
    this.triggerBackgroundChannexPush(hotelId);
    return result;
  }

  @ApiDescript("Cập nhật số lượng phòng trống và phòng chặn cho các ngày")
  @RequirePermission("hotel.rooms.manage")
  @SuccessMessage("Cập nhật phòng trống thành công")
  @Post("hotels/:hotelId/inventory/availability")
  async updateAvailability(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    const payload = parseWithZod(updateAvailabilitySchema, body);
    const result = await this.ariCoreService.updateAvailability(hotelId, payload.items);
    this.triggerBackgroundChannexPush(hotelId, true);
    return result;
  }

  @ApiDescript("Áp dụng giá và hạn chế hàng loạt theo dải ngày và các thứ trong tuần")
  @RequirePermission("hotel.rooms.manage")
  @SuccessMessage("Áp dụng hạn chế hàng loạt thành công")
  @Post("hotels/:hotelId/inventory/bulk-update")
  async bulkUpdate(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    const payload = parseWithZod(bulkUpdateRestrictionsSchema, body);
    const result = await this.ariCoreService.bulkUpdateRestrictions(hotelId, payload);
    this.triggerBackgroundChannexPush(hotelId);
    return result;
  }

  @ApiDescript("Kênh đồng bộ iCal công khai (Airbnb/Booking.com/Agoda lấy lịch phòng đã đặt/chặn)")
  @Get(["ical/:token.ics", "ical/:token"])
  async getIcalFeed(@Param("token") rawToken: string, @Res() res: Response) {
    const token = parseWithZod(icalTokenParamSchema, rawToken.replace(/\.ics$/i, ""));
    const icalContent = await this.icalService.generateOutboundIcalByToken(token);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${token}.ics"`);
    res.send(icalContent);
  }

  @ApiDescript("Kích hoạt đồng bộ iCal hai chiều ngay lập tức cho 1 kết nối")
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Kích hoạt đồng bộ iCal thành công")
  @Post("hotels/:hotelId/connections/:id/sync-now")
  async syncNow(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("id") idParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const id = parseWithZod(connectionIdParamSchema, idParam);
    await this.assertAccess(req, hotelId);
    await this.channelManagerService.getConnectionById(hotelId, id);
    return this.channelManagerService.syncNow(id);
  }

  // ================= CHANNEX PRO-TIER INTEGRATION ================= //

  @ApiDescript(
    "Đồng bộ thông tin cơ sở, hạng phòng và gói giá sang Channex (Idempotent Content Sync)",
  )
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Đồng bộ dữ liệu sang Channex thành công")
  @Post("hotels/:hotelId/channex/sync-content")
  async syncChannexContent(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    const payload = parseWithZod(channexSyncContentSchema, body);
    const result = await this.channexSyncService.syncContent(hotelId, payload);
    if (!result.success) throw new BadRequestException(result.error ?? "Đối soát Channex thất bại");
    await this.auditService.recordHotelAction({
      actorId: req.user.userId,
      hotelId,
      action: "CHANNEX_CONTENT_SYNC",
      metadata: {
        channexPropertyId: result.channexPropertyId,
        roomTypesSyncedCount: result.roomTypesSynced?.length ?? 0,
        ratePlansSyncedCount: result.ratePlansSynced?.length ?? 0,
      },
    });
    return result;
  }

  @ApiDescript(
    "Đẩy kho phòng trống và giá/hạn chế sang Channex (ARI Delta Push with Range Compression)",
  )
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Đẩy ARI sang Channex thành công")
  @Post("hotels/:hotelId/channex/push-ari")
  async pushChannexAri(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    const payload = parseWithZod(channexPushAriSchema, body);
    const result = await this.channexAriSyncService.pushAri(hotelId, payload);
    if (!result.success)
      throw new BadRequestException(
        "Đẩy ARI chưa được Channex xác nhận toàn bộ; kiểm tra log và đối soát lại",
      );
    return result;
  }

  @ApiDescript("Quét và xử lý booking mới từ Channex Revisions Feed (Apply-then-Ack Inbound Feed)")
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Xử lý booking feed từ Channex thành công")
  @Post("hotels/:hotelId/channex/poll-feed")
  async pollChannexFeed(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    const payload = parseWithZod(channexPollFeedSchema, body);
    const result = await this.channexBookingIngestionService.drainFeed({
      hotelId,
      limit: payload.limit,
    });
    if (!result.success)
      throw new BadRequestException("Booking feed còn lỗi hoặc booking sửa đổi đang chờ đối soát");
    await this.auditService.recordHotelAction({
      actorId: req.user.userId,
      hotelId,
      action: "CHANNEX_FEED_DRAIN",
      metadata: { limit: payload.limit },
    });
    return result;
  }

  @ApiDescript("Webhook tiếp nhận thông báo đặt phòng thời gian thực từ Channex")
  @ApiHeader({
    name: "X-Channex-Webhook-Secret",
    required: true,
    description: "Shared secret configured when registering the Channex webhook",
  })
  @Post("channex/webhook")
  async channexWebhook(
    @Headers("x-channex-webhook-secret") webhookSecret: string | undefined,
    @Body() body: unknown,
  ) {
    assertChannexWebhookSecret(webhookSecret);
    const payload = parseWithZod(channexWebhookSchema, body);
    return this.channexBookingIngestionService.handleWebhook(payload);
  }

  @ApiDescript("Khôi phục đặt phòng sau sự cố (Manual Time-scoped Outage Recovery)")
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Khôi phục đặt phòng sự cố thành công")
  @Post("hotels/:hotelId/channex/recover")
  async recoverChannexBookings(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    const payload = parseWithZod(channexRecoverSchema, body);
    const result = await this.channexBookingIngestionService.recoverOutage(hotelId, payload.since);
    if (!result.success)
      throw new BadRequestException(
        "Khôi phục Channex chưa hoàn tất; chia nhỏ khoảng thời gian và thử lại",
      );
    await this.auditService.recordHotelAction({
      actorId: req.user.userId,
      hotelId,
      action: "CHANNEX_FEED_RECOVER",
      metadata: { since: payload.since },
    });
    return result;
  }

  @ApiDescript("Danh sách booking Channex sửa đổi đang chờ đối soát")
  @RequirePermission(["hotel.channels.view", "platform.hotels.view"])
  @Get("hotels/:hotelId/channex/pending-modifications")
  async getPendingChannexModifications(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    return this.channexBookingIngestionService.getPendingModifications(hotelId);
  }

  @ApiDescript("Xác nhận booking Channex đã được đối soát thủ công")
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @Post("hotels/:hotelId/channex/pending-modifications/:logId/resolve")
  async resolveChannexModification(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("logId") logIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const logId = parseWithZod(connectionIdParamSchema, logIdParam);
    await this.assertAccess(req, hotelId);
    const result = await this.channexBookingIngestionService.resolveModification(hotelId, logId);
    await this.auditService.recordHotelAction({
      actorId: req.user.userId,
      hotelId,
      action: "CHANNEX_RECONCILIATION_RESOLVE",
      metadata: { logId },
    });
    return result;
  }

  @ApiDescript("Chẩn đoán toàn diện sức khỏe kết nối Channex (Doctor Check)")
  @RequirePermission(["hotel.channels.view", "platform.hotels.view"])
  @SuccessMessage("Chạy chẩn đoán Channex thành công")
  @Get("hotels/:hotelId/channex/doctor")
  async runChannexDoctor(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    return this.channexDoctorService.runDoctor(hotelId);
  }

  @ApiDescript("Lấy danh sách các ID mapping giữa PMS và Channex")
  @RequirePermission(["hotel.channels.view", "platform.hotels.view"])
  @SuccessMessage("Lấy danh sách mapping thành công")
  @Get("hotels/:hotelId/channex/mappings")
  async getChannexMappings(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    return this.channexSyncService.getMappings(hotelId);
  }

  @ApiDescript("Lấy toàn bộ catalog nền tảng và các kênh OTA đã kết nối trên Channex")
  @RequirePermission(["hotel.channels.view", "platform.hotels.view"])
  @SuccessMessage("Lấy catalog kênh Channex thành công")
  @Get("hotels/:hotelId/channex/channels")
  async getChannexChannels(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    return this.channexChannelSessionService.getCatalog(hotelId);
  }

  @ApiDescript("Kiểm tra cấu hình và lấy dữ liệu mapping cho native OTA wizard")
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Chuẩn bị cấu hình kênh OTA thành công")
  @Post("hotels/:hotelId/channex/channels/prepare")
  async prepareChannexChannel(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    const payload = parseWithZod(channexPrepareChannelSchema, body);
    return this.channexChannelSessionService.prepareNativeChannel(hotelId, payload);
  }

  @ApiDescript("Tạo kênh OTA ở trạng thái inactive và kiểm tra readiness")
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Tạo kênh OTA thành công")
  @Post("hotels/:hotelId/channex/channels")
  async createChannexChannel(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    const payload = parseWithZod(channexCreateChannelSchema, body);
    const result = await this.channexChannelSessionService.createNativeChannel(hotelId, payload);
    const createdChannelId = (result as any)?.channel?.id ?? (result as any)?.id ?? null;
    await this.auditService.recordHotelAction({
      actorId: req.user.userId,
      hotelId,
      action: "CHANNEX_CHANNEL_CREATE",
      entityType: "ChannexChannel",
      entityId: createdChannelId,
      metadata: { channel: payload.channel, title: payload.title },
    });
    return result;
  }

  @ApiDescript("Kích hoạt kênh OTA đã vượt readiness check")
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Kích hoạt kênh OTA thành công")
  @Post("hotels/:hotelId/channex/channels/:channelId/activate")
  async activateChannexChannel(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("channelId") channelIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const channelId = parseWithZod(channexChannelIdSchema, channelIdParam);
    await this.assertAccess(req, hotelId);
    const result = await this.channexChannelSessionService.activateNativeChannel(hotelId, channelId);
    await this.auditService.recordHotelAction({
      actorId: req.user.userId,
      hotelId,
      action: "CHANNEX_CHANNEL_ACTIVATE",
      entityType: "ChannexChannel",
      entityId: channelId,
    });
    return result;
  }

  @ApiDescript("Tạm dừng đồng bộ kênh OTA")
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Tạm dừng kênh OTA thành công")
  @Post("hotels/:hotelId/channex/channels/:channelId/deactivate")
  async deactivateChannexChannel(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("channelId") channelIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const channelId = parseWithZod(channexChannelIdSchema, channelIdParam);
    await this.assertAccess(req, hotelId);
    const result = await this.channexChannelSessionService.deactivateNativeChannel(hotelId, channelId);
    await this.auditService.recordHotelAction({
      actorId: req.user.userId,
      hotelId,
      action: "CHANNEX_CHANNEL_DEACTIVATE",
      entityType: "ChannexChannel",
      entityId: channelId,
    });
    return result;
  }

  @ApiDescript("Lấy chi tiết kênh OTA, thông số adapter và bảng ánh xạ phòng/giá hiện tại")
  @RequirePermission(["hotel.channels.view", "platform.hotels.view"])
  @SuccessMessage("Lấy chi tiết kênh OTA thành công")
  @Get("hotels/:hotelId/channex/channels/:channelId")
  async getChannexChannel(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("channelId") channelIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const channelId = parseWithZod(channexChannelIdSchema, channelIdParam);
    await this.assertAccess(req, hotelId);
    return this.channexChannelSessionService.getChannelDetails(hotelId, channelId);
  }

  @ApiDescript("Cập nhật thông tin kênh OTA hoặc ánh xạ gói giá")
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Cập nhật kênh OTA thành công")
  @Put("hotels/:hotelId/channex/channels/:channelId")
  async updateChannexChannel(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("channelId") channelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const channelId = parseWithZod(channexChannelIdSchema, channelIdParam);
    await this.assertAccess(req, hotelId);
    const payload = parseWithZod(channexUpdateChannelSchema, body);
    const result = await this.channexChannelSessionService.updateNativeChannel(hotelId, channelId, payload);
    await this.auditService.recordHotelAction({
      actorId: req.user.userId,
      hotelId,
      action: "CHANNEX_CHANNEL_UPDATE",
      entityType: "ChannexChannel",
      entityId: channelId,
      metadata: { title: payload.title },
    });
    return result;
  }

  @ApiDescript("Đồng bộ toàn phần (Full Sync) dữ liệu cho kênh OTA")
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Yêu cầu đồng bộ toàn phần thành công")
  @Post("hotels/:hotelId/channex/channels/:channelId/sync")
  async syncChannexChannel(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("channelId") channelIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const channelId = parseWithZod(channexChannelIdSchema, channelIdParam);
    await this.assertAccess(req, hotelId);
    const result = await this.channexChannelSessionService.syncNativeChannel(hotelId, channelId);
    await this.auditService.recordHotelAction({
      actorId: req.user.userId,
      hotelId,
      action: "CHANNEX_CHANNEL_FULL_SYNC",
      entityType: "ChannexChannel",
      entityId: channelId,
    });
    return result;
  }

  @ApiDescript("Ngắt kết nối và xóa kênh OTA")
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Xóa kênh OTA thành công")
  @Delete("hotels/:hotelId/channex/channels/:channelId")
  async deleteChannexChannel(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Param("channelId") channelIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    const channelId = parseWithZod(channexChannelIdSchema, channelIdParam);
    await this.assertAccess(req, hotelId);
    const result = await this.channexChannelSessionService.deleteNativeChannel(hotelId, channelId);
    await this.auditService.recordHotelAction({
      actorId: req.user.userId,
      hotelId,
      action: "CHANNEX_CHANNEL_DELETE",
      entityType: "ChannexChannel",
      entityId: channelId,
    });
    return result;
  }

  @ApiDescript("Tạo phiên one-time để quản lý adapter đặc biệt bằng Channex Channel IFrame")
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Tạo phiên quản lý kênh Channex thành công")
  @Post("hotels/:hotelId/channex/channel-session")
  async createChannexChannelSession(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    const payload = parseWithZod(channexChannelSessionSchema, body);
    return this.channexChannelSessionService.create(hotelId, req.user.email, payload.channelId);
  }

  @ApiDescript(
    "Super Admin: Bắn đơn đặt phòng thử nghiệm (Simulate OTA Booking) lên Channex và tự động hút về PMS",
  )
  @RequirePermission(["platform.hotels.manage"])
  @SuccessMessage("Bắn đơn đặt phòng thử nghiệm thành công")
  @Post("hotels/:hotelId/channex/simulate-booking")
  async simulateBooking(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    const dto = parseWithZod(channexSimulateBookingSchema, body);
    return this.channexBookingIngestionService.simulateOtaBooking(hotelId, dto);
  }

  @ApiDescript(
    "Super Admin: Hủy đơn đặt phòng thử nghiệm (Simulate OTA Booking Cancellation) và giải phóng phòng trong PMS",
  )
  @RequirePermission(["platform.hotels.manage"])
  @SuccessMessage("Hủy đơn đặt phòng thử nghiệm thành công")
  @Post("hotels/:hotelId/channex/simulate-booking/cancel")
  async cancelSimulatedBooking(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    const dto = parseWithZod(channexCancelBookingSchema, body);
    return this.channexBookingIngestionService.simulateCancelOtaBooking(hotelId, dto);
  }

  @ApiDescript("Super Admin: Lấy danh sách các đơn đặt phòng thử nghiệm gần đây")
  @RequirePermission(["hotel.reservations.view", "platform.hotels.view"])
  @SuccessMessage("Lấy danh sách đơn đặt phòng thử nghiệm thành công")
  @Get("hotels/:hotelId/channex/simulated-bookings")
  async getSimulatedBookings(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    return this.channexBookingIngestionService.getRecentSimulatedBookings(hotelId);
  }

  @ApiDescript("Lấy cấu hình Channex Property của khách sạn và danh sách properties từ Channex")
  @RequirePermission(["hotel.channels.view", "platform.hotels.view"])
  @SuccessMessage("Lấy cấu hình Channex Property thành công")
  @Get("hotels/:hotelId/channex/config")
  async getChannexConfig(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    return this.channexSyncService.getPropertyConfig(hotelId);
  }

  @ApiDescript("Cấu hình liên kết Channex Property ID cho khách sạn")
  @RequirePermission(["hotel.channels.manage", "platform.hotels.manage"])
  @SuccessMessage("Lưu cấu hình Channex Property thành công")
  @Post("hotels/:hotelId/channex/config")
  async configureChannexProperty(
    @Req() req: RequestWithRequiredUser,
    @Param("hotelId") hotelIdParam: string,
    @Body() body: unknown,
  ) {
    const hotelId = parseWithZod(hotelIdParamSchema, hotelIdParam);
    await this.assertAccess(req, hotelId);
    const dto = parseWithZod(channexConfigurePropertySchema, body);
    const result = await this.channexSyncService.configureProperty(hotelId, dto.channexPropertyId);
    await this.auditService.recordHotelAction({
      actorId: req.user.userId,
      hotelId,
      action: "CHANNEX_PROPERTY_CONFIGURE",
      metadata: { channexPropertyId: dto.channexPropertyId },
    });
    return result;
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Logger,
  Param,
  Post,
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
  ) {}

  private readonly logger = new Logger(ChannelManagerController.name);

  private async assertAccess(req: RequestWithRequiredUser, hotelId: string): Promise<string> {
    await this.hotelAccessService.assertHotelAccess(req.user.userId, req.user.roleId, hotelId);
    return hotelId;
  }

  private triggerBackgroundChannexPush(hotelId: string) {
    setImmediate(async () => {
      try {
        await this.channexAriSyncService.pushAri(hotelId);
      } catch (err: any) {
        this.logger.debug?.(
          `[AutoChannexPush] Hotel ${hotelId} push skipped or failed: ${err.message}`,
        );
      }
    });
  }

  @ApiDescript("Danh sách các kết nối kênh phân phối phòng của khách sạn")
  @RequirePermission("hotel.rooms.view")
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
  @RequirePermission("hotel.rooms.manage")
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
  @RequirePermission("hotel.rooms.manage")
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
    this.triggerBackgroundChannexPush(hotelId);
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
  @RequirePermission("hotel.rooms.manage")
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
  @RequirePermission("hotel.rooms.manage")
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
    return this.channexSyncService.syncContent(hotelId, payload);
  }

  @ApiDescript(
    "Đẩy kho phòng trống và giá/hạn chế sang Channex (ARI Delta Push with Range Compression)",
  )
  @RequirePermission("hotel.rooms.manage")
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
    return this.channexAriSyncService.pushAri(hotelId, payload);
  }

  @ApiDescript("Quét và xử lý booking mới từ Channex Revisions Feed (Apply-then-Ack Inbound Feed)")
  @RequirePermission("hotel.rooms.manage")
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
    return this.channexBookingIngestionService.drainFeed({
      hotelId,
      limit: payload.limit,
    });
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
  @RequirePermission("hotel.rooms.manage")
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
    return this.channexBookingIngestionService.recoverOutage(hotelId, payload.since);
  }

  @ApiDescript("Chẩn đoán toàn diện sức khỏe kết nối Channex (Doctor Check)")
  @RequirePermission("hotel.rooms.view")
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
  @RequirePermission("hotel.rooms.view")
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
  @RequirePermission("hotel.rooms.view")
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
  @RequirePermission("hotel.rooms.manage")
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
  @RequirePermission("hotel.rooms.manage")
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
    return this.channexChannelSessionService.createNativeChannel(hotelId, payload);
  }

  @ApiDescript("Kích hoạt kênh OTA đã vượt readiness check")
  @RequirePermission("hotel.rooms.manage")
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
    return this.channexChannelSessionService.activateNativeChannel(hotelId, channelId);
  }

  @ApiDescript("Tạo phiên one-time để quản lý adapter đặc biệt bằng Channex Channel IFrame")
  @RequirePermission("hotel.rooms.manage")
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
  @RequirePermission("hotel.rooms.manage")
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
  @RequirePermission("hotel.rooms.manage")
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
  @RequirePermission("hotel.rooms.view")
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
  @RequirePermission("hotel.rooms.view")
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
  @RequirePermission("hotel.rooms.manage")
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
    return this.channexSyncService.configureProperty(hotelId, dto.channexPropertyId);
  }
}

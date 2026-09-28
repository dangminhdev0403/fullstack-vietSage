import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { RequestWithRequiredUser } from "../../../shared/security/request-with-authenticated-user";
import { HotelAccessService } from "../../property/property-public";
import {
  bulkUpdateRestrictionsSchema,
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
import { IcalService } from "../services/ical.service";

@ApiTags("channel-manager")
@Controller("api/v1/channel-manager")
export class ChannelManagerController {
  constructor(
    private readonly channelManagerService: ChannelManagerService,
    private readonly ariCoreService: AriCoreService,
    private readonly icalService: IcalService,
    private readonly hotelAccessService: HotelAccessService,
  ) {}

  private async assertAccess(req: RequestWithRequiredUser, hotelId: string): Promise<string> {
    await this.hotelAccessService.assertHotelAccess(
      req.user.userId,
      req.user.roleId,
      hotelId,
    );
    return hotelId;
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
    return this.ariCoreService.getInventoryGrid(
      hotelId,
      q.date_from,
      q.date_to,
      q.roomType,
    );
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
    return this.ariCoreService.updateRestrictions(hotelId, payload.items);
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
    return this.ariCoreService.updateAvailability(hotelId, payload.items);
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
    return this.ariCoreService.bulkUpdateRestrictions(hotelId, payload);
  }

  @ApiDescript("Kênh đồng bộ iCal công khai (Airbnb/Booking.com/Agoda lấy lịch phòng đã đặt/chặn)")
  @Get(["ical/:token.ics", "ical/:token"])
  async getIcalFeed(@Param("token") rawToken: string, @Res() res: Response) {
    const token = parseWithZod(
      icalTokenParamSchema,
      rawToken.replace(/\.ics$/i, ""),
    );
    const icalContent = await this.icalService.generateOutboundIcalByToken(token);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `inline; filename="${token}.ics"`);
    res.send(icalContent);
  }

  @ApiDescript("Kích hoạt đồng bộ iCal hai chiều ngay lập tức cho 1 kết nối")
  @RequirePermission("hotel.rooms.manage")
  @SuccessMessage("Kích hoạt đồng bộ iCal thành công")
  @Post("connections/:id/sync-now")
  async syncNow(@Param("id") idParam: string) {
    const id = parseWithZod(connectionIdParamSchema, idParam);
    return this.channelManagerService.syncNow(id);
  }
}

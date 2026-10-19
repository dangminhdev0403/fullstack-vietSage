import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import {
  catalogExportSchema,
  confirmHoldSchema,
  createHoldSchema,
  directBookingStatusQuerySchema,
  releaseHoldSchema,
} from "../domain/schemas/direct-booking.schema";
import { DirectBookingHmacGuard } from "../guards/direct-booking-hmac.guard";
import { DirectBookingService } from "../services/direct-booking.service";

@ApiTags("channel-manager-direct-booking")
@UseGuards(DirectBookingHmacGuard)
@Controller(["channel-manager/direct-booking", "api/v1/channel-manager/direct-booking"])
export class DirectBookingController {
  constructor(private readonly directBookingService: DirectBookingService) {}

  /**
   * Tạo inventory hold cho OTA Direct Booking
   */
  @Post("holds")
  async createHold(@Body() body: unknown) {
    const dto = parseWithZod(createHoldSchema, body);
    const result = await this.directBookingService.createHold(dto);
    return {
      success: true,
      data: result,
    };
  }

  /**
   * Xác nhận hold và tự động gán phòng trống sạch
   */
  @Post(["holds/:id/confirm", "holds/confirm"])
  async confirmHold(@Param("id") paramId: string | undefined, @Body() body: unknown) {
    const dto = parseWithZod(confirmHoldSchema, body);
    const holdId = paramId || dto.hold_id || "";
    const result = await this.directBookingService.confirmHold(
      holdId,
      dto.booking_id,
      dto.operation_key,
    );
    return {
      success: true,
      data: result,
    };
  }

  /**
   * Giải phóng hold
   */
  @Post(["holds/:id/release", "holds/release"])
  async releaseHold(@Param("id") paramId: string | undefined, @Body() body: unknown) {
    const dto = parseWithZod(releaseHoldSchema, body);
    const holdId = paramId || dto.hold_id || "";
    const result = await this.directBookingService.releaseHold(holdId, dto.reason);
    return {
      success: true,
      data: result,
    };
  }

  /**
   * Tra cứu trạng thái đơn phục vụ đối soát
   */
  @Get("status")
  async getStatus(@Query() query: unknown) {
    const parsedQuery = parseWithZod(directBookingStatusQuerySchema, query);
    const result = await this.directBookingService.getStatus(parsedQuery);
    return {
      success: true,
      data: result,
    };
  }

  /**
   * Xuất danh mục phòng và giá cơ sở từ VietSage PMS cho OTA Booking Manager
   */
  @Post("catalog-export")
  async exportCatalog(@Body() body: unknown) {
    const dto = parseWithZod(catalogExportSchema, body);
    const result = await this.directBookingService.exportRoomCatalog(dto);
    return {
      success: true,
      data: result,
    };
  }
}

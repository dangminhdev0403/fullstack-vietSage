import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBody, ApiTags } from "@nestjs/swagger";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import { LocalMateService } from "../application/localmate.service";
import { LocalMateTelegramPairingService } from "../application/localmate-telegram-pairing.service";
import {
  createLocalMateGuideSchema,
  createLocalMateGuideOpenApiSchema,
  updateLocalMateGuideSchema,
  updateLocalMateGuideOpenApiSchema,
  updateQualificationStatusSchema,
  listLocalMateGuidesQuerySchema,
  listLocalMateToursQuerySchema,
  createLocalMateTourSchema,
  createLocalMateTourOpenApiSchema,
  updateLocalMateTourSchema,
  updateLocalMateTourOpenApiSchema,
  idParamSchema,
} from "../domain/schemas/localmate.schema";

@ApiTags("localmate-admin")
@Controller("localmate-admin")
export class LocalMateAdminController {
  constructor(
    private readonly service: LocalMateService,
    private readonly pairingService: LocalMateTelegramPairingService,
  ) {}

  @SuccessMessage("Tạo hồ sơ hướng dẫn viên LocalMate thành công")
  @RequirePermission("platform.localmate.manage")
  @ApiDescript("Tạo hồ sơ hướng dẫn viên LocalMate mới")
  @ApiBody({ schema: createLocalMateGuideOpenApiSchema })
  @Post("guides")
  async createGuide(@Body() body: unknown) {
    const dto = parseWithZod(createLocalMateGuideSchema, body);
    return this.service.createGuide(dto);
  }

  @SuccessMessage("Lấy danh sách hướng dẫn viên LocalMate thành công")
  @RequirePermission("platform.localmate.view")
  @ApiDescript("Lấy danh sách hướng dẫn viên LocalMate")
  @Get("guides")
  async listGuides(@Query() query: unknown) {
    const filters = parseWithZod(listLocalMateGuidesQuerySchema, query ?? {});
    return this.service.listGuides(filters);
  }

  @SuccessMessage("Lấy chi tiết hướng dẫn viên LocalMate thành công")
  @RequirePermission("platform.localmate.view")
  @ApiDescript("Lấy chi tiết hướng dẫn viên LocalMate theo ID")
  @Get("guides/:id")
  async getGuide(@Param("id") idParam: string) {
    const id = parseWithZod(idParamSchema, idParam);
    return this.service.getGuideById(id);
  }

  @SuccessMessage("Cập nhật thông tin hướng dẫn viên LocalMate thành công")
  @RequirePermission("platform.localmate.manage")
  @ApiDescript("Cập nhật thông tin hướng dẫn viên")
  @ApiBody({ schema: updateLocalMateGuideOpenApiSchema })
  @Patch("guides/:id")
  async updateGuide(@Param("id") idParam: string, @Body() body: unknown) {
    const id = parseWithZod(idParamSchema, idParam);
    const dto = parseWithZod(updateLocalMateGuideSchema, body);
    return this.service.updateGuide(id, dto);
  }

  @SuccessMessage("Thẩm định trạng thái Qualified cho hướng dẫn viên thành công")
  @RequirePermission("platform.localmate.manage")
  @ApiDescript("Cập nhật trạng thái thẩm định (QUALIFIED/SUSPENDED) cho LocalMate")
  @Patch("guides/:id/qualification")
  async updateQualification(@Param("id") idParam: string, @Body() body: unknown) {
    const id = parseWithZod(idParamSchema, idParam);
    const dto = parseWithZod(updateQualificationStatusSchema, body);
    return this.service.updateQualification(id, dto);
  }

  @SuccessMessage("Tạo liên kết kết nối Telegram cho hướng dẫn viên thành công")
  @RequirePermission("platform.localmate.manage")
  @ApiDescript("Tạo liên kết một lần để kết nối tài khoản Telegram với hướng dẫn viên")
  @Post("guides/:id/telegram-pair")
  async createTelegramPairingLink(@Param("id") idParam: string) {
    const id = parseWithZod(idParamSchema, idParam);
    return this.pairingService.createPairingLinkForProfile(id);
  }

  @SuccessMessage("Hủy kết nối Telegram của hướng dẫn viên thành công")
  @RequirePermission("platform.localmate.manage")
  @ApiDescript("Hủy kết nối tài khoản Telegram của hướng dẫn viên")
  @Post("guides/:id/telegram-disconnect")
  async disconnectTelegram(@Param("id") idParam: string) {
    const id = parseWithZod(idParamSchema, idParam);
    return this.pairingService.disconnectForProfile(id);
  }

  @SuccessMessage("Tạo lịch trình tour mới vào kho tri thức thành công")
  @RequirePermission("platform.localmate.manage")
  @ApiDescript("Thêm mới lịch trình tour thủ công vào kho tri thức LocalMate")
  @ApiBody({ schema: createLocalMateTourOpenApiSchema })
  @Post("knowledge/tours")
  async createTour(@Body() body: unknown) {
    const dto = parseWithZod(createLocalMateTourSchema, body);
    return this.service.createTour(dto);
  }

  @SuccessMessage("Cập nhật lịch trình tour thành công")
  @RequirePermission("platform.localmate.manage")
  @ApiDescript("Cập nhật thông tin lịch trình tour")
  @ApiBody({ schema: updateLocalMateTourOpenApiSchema })
  @Patch("knowledge/tours/:id")
  async updateTour(@Param("id") idParam: string, @Body() body: unknown) {
    const id = parseWithZod(idParamSchema, idParam);
    const dto = parseWithZod(updateLocalMateTourSchema, body);
    return this.service.updateTour(id, dto);
  }

  @SuccessMessage("Xóa lịch trình tour khỏi kho tri thức thành công")
  @RequirePermission("platform.localmate.manage")
  @ApiDescript("Xóa lịch trình tour khỏi kho tri thức")
  @Delete("knowledge/tours/:id")
  async deleteTour(@Param("id") idParam: string) {
    const id = parseWithZod(idParamSchema, idParam);
    return this.service.deleteTour(id);
  }

  @SuccessMessage("Lấy danh sách lịch trình tour trong kho tri thức thành công")
  @RequirePermission("platform.localmate.view")
  @ApiDescript("Lấy danh sách lịch trình tour trong kho tri thức")
  @Get("knowledge/tours")
  async listTours(@Query() query?: unknown) {
    const filters = parseWithZod(listLocalMateToursQuerySchema, query ?? {});
    return this.service.listTours(filters);
  }
}

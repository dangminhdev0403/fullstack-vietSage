import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { ApiHeader, ApiResponse, ApiTags } from "@nestjs/swagger";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { AuthRateLimit } from "../../../common/security/auth-rate-limit.decorator";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SkipAuthorization } from "../../../shared/decorators/skip-authorization.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import { LocalMateService } from "../application/localmate.service";
import { LocalmateKnowledgeKeyGuard } from "../infrastructure/guards/localmate-knowledge-key.guard";
import {
  matchLocalMateRequestSchema,
  guideCodeParamSchema,
  queryLocalMateKnowledgeSchema,
  listLocalMateToursQuerySchema,
} from "../domain/schemas/localmate.schema";

@ApiTags("localmate")
@Controller("localmate")
export class LocalMateAiController {
  constructor(private readonly service: LocalMateService) {}

  @SkipAuthorization()
  @AuthRateLimit("knowledge")
  @UseGuards(LocalmateKnowledgeKeyGuard)
  @ApiHeader({
    name: "X-VietSage-Knowledge-Key",
    required: true,
    description: "Dedicated API key for machine-to-machine knowledge access",
  })
  @ApiResponse({ status: 200, description: "Structured LocalMate knowledge" })
  @ApiResponse({ status: 401, description: "Invalid or missing knowledge API key" })
  @ApiResponse({ status: 429, description: "Knowledge request rate limit exceeded" })
  @ApiResponse({ status: 503, description: "Knowledge service key unconfigured" })
  @SuccessMessage("Lấy kho tri thức LocalMate thành công")
  @ApiDescript(
    "Private AI API kho tri thức LocalMate: Nguồn tri thức lịch trình tour và hướng dẫn viên bản địa cho AI ngoài",
  )
  @Get("knowledge")
  async getKnowledge(@Query() query: unknown, @Res({ passthrough: true }) response?: Response) {
    const dto = parseWithZod(queryLocalMateKnowledgeSchema, query ?? {});
    response?.setHeader("Cache-Control", "private, no-store");
    return this.service.getKnowledge(dto);
  }

  @SkipAuthorization()
  @AuthRateLimit("knowledge")
  @UseGuards(LocalmateKnowledgeKeyGuard)
  @ApiHeader({
    name: "X-VietSage-Knowledge-Key",
    required: true,
    description: "Dedicated API key for machine-to-machine knowledge access",
  })
  @ApiResponse({ status: 200, description: "Structured LocalMate knowledge" })
  @ApiResponse({ status: 401, description: "Invalid or missing knowledge API key" })
  @ApiResponse({ status: 429, description: "Knowledge request rate limit exceeded" })
  @ApiResponse({ status: 503, description: "Knowledge service key unconfigured" })
  @HttpCode(HttpStatus.OK)
  @SuccessMessage("Truy vấn kho tri thức LocalMate thành công")
  @ApiDescript("Private AI API truy vấn kho tri thức LocalMate qua POST payload cho AI ngoài")
  @Post("knowledge")
  async queryKnowledge(@Body() body: unknown, @Res({ passthrough: true }) response?: Response) {
    const dto = parseWithZod(queryLocalMateKnowledgeSchema, body ?? {});
    response?.setHeader("Cache-Control", "private, no-store");
    return this.service.getKnowledge(dto);
  }

  @SkipAuthorization()
  @AuthRateLimit("knowledge")
  @UseGuards(LocalmateKnowledgeKeyGuard)
  @ApiHeader({
    name: "X-VietSage-Knowledge-Key",
    required: true,
    description: "Dedicated API key for machine-to-machine LocalMate access",
  })
  @ApiResponse({ status: 200, description: "Rule-based LocalMate matching result" })
  @ApiResponse({ status: 401, description: "Invalid or missing knowledge API key" })
  @ApiResponse({ status: 429, description: "Knowledge request rate limit exceeded" })
  @HttpCode(HttpStatus.OK)
  @SuccessMessage("Gợi ý danh sách LocalMate phù hợp thành công")
  @ApiDescript("Đối sánh LocalMate theo quy tắc; không gọi mô hình AI")
  @Post("ai/match")
  async matchLocalMates(@Body() body: unknown) {
    const dto = parseWithZod(matchLocalMateRequestSchema, body ?? {});
    return this.service.matchLocalMatesForAI(dto);
  }

  @SuccessMessage("Lấy thông tin hồ sơ LocalMate thành công")
  @ApiDescript("Lấy thông tin chi tiết của 1 LocalMate theo mã định danh")
  @Get("guides/:guideCode")
  async getGuideByCode(@Param("guideCode") codeParam: string) {
    const guideCode = parseWithZod(guideCodeParamSchema, codeParam);
    const guide = await this.service.getGuideByCode(guideCode);
    return {
      code: guide.guideCode,
      guideCode: guide.guideCode,
      name: guide.fullName,
      fullName: guide.fullName,
      avatar: guide.avatarUrl,
      avatarUrl: guide.avatarUrl,
      languages: guide.languages,
      operatingRegions: guide.operatingRegions,
      specialties: guide.specialties,
      dailyRateVnd: guide.dailyRateVnd,
      rating: guide.rating,
      totalReviews: guide.totalReviews,
      bio: guide.bio,
    };
  }

  @SkipAuthorization()
  @AuthRateLimit("knowledge")
  @UseGuards(LocalmateKnowledgeKeyGuard)
  @ApiHeader({
    name: "X-VietSage-Knowledge-Key",
    required: true,
    description: "Dedicated API key for machine-to-machine knowledge access",
  })
  @ApiResponse({ status: 200, description: "LocalMate tour knowledge" })
  @ApiResponse({ status: 401, description: "Invalid or missing knowledge API key" })
  @ApiResponse({ status: 429, description: "Knowledge request rate limit exceeded" })
  @ApiResponse({ status: 503, description: "Knowledge service key unconfigured" })
  @SuccessMessage("Lấy danh sách tour gợi ý thành công")
  @ApiDescript("Tìm kiếm lịch trình tour từ kho tri thức LocalMate")
  @Get("tours")
  async listTours(
    @Query("destination") destination?: string,
    @Query() rawQuery?: Record<string, unknown>,
  ) {
    if (typeof destination === "string" && (!rawQuery || Object.keys(rawQuery).length <= 1)) {
      return this.service.listTours(destination);
    }
    const filters = parseWithZod(
      listLocalMateToursQuerySchema,
      rawQuery ?? (destination ? { destination } : {}),
    );
    return this.service.listTours(filters);
  }
}

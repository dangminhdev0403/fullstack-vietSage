import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from "@nestjs/swagger";
import { successEnvelopeSchema } from "../../../common/openapi/contract-schemas";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { RequirePermission } from "../../../shared/decorators/require-permission.decorator";
import type { RequestWithRequiredUser } from "../../../shared/security/request-with-authenticated-user";
import { KbttService } from "../application/kbtt.service";
import {
  hotelIdParamSchema,
  kbttAutoSubmitConfigSchema,
  kbttAutoSubmitScheduleSchema,
  kbttAutoSubmitTestQuerySchema,
  kbttBatchSubmitSummarySchema,
  kbttCatalogKindSchema,
  kbttCatalogQuerySchema,
  kbttCredentialsSchema,
  kbttDevResetSchema,
  kbttDevUpdateOccupantsSchema,
  kbttPaginationQuerySchema,
  occupantIdParamSchema,
  stayIdParamSchema,
  type KbttCredentials,
} from "../domain/schemas/kbtt.schema";

const connectionSchema = successEnvelopeSchema(
  {
    type: "object",
    additionalProperties: false,
    required: [
      "configured",
      "status",
      "maskedUsername",
      "csltId",
      "lastCheckedAt",
      "lastConnectedAt",
      "lastErrorCode",
      "lastErrorMessage",
    ],
    properties: {
      configured: { type: "boolean" },
      status: { type: "string", enum: ["DISCONNECTED", "CONNECTED", "AUTH_FAILED"] },
      maskedUsername: { type: "string", nullable: true },
      csltId: { type: "string", nullable: true },
      lastCheckedAt: { type: "string", format: "date-time", nullable: true },
      lastConnectedAt: { type: "string", format: "date-time", nullable: true },
      lastErrorCode: { type: "string", nullable: true },
      lastErrorMessage: { type: "string", nullable: true },
    },
  },
  200,
  "Thành công",
);

@ApiTags("hotel-kbtt")
@ApiBearerAuth("bearer")
@ApiParam({ name: "hotelId", type: String })
@ApiResponse({ status: 401, description: "Authentication required" })
@ApiResponse({ status: 403, description: "Hotel scope or business permission denied" })
@ApiResponse({
  status: 422,
  description: "KBTT_AUTH_FAILED; sanitized provider authentication failure",
})
@ApiResponse({
  status: 503,
  description: "KBTT_UNAVAILABLE; runtime secrets, encryption or storage unavailable",
})
@Controller("hotels/:hotelId/kbtt")
export class KbttController {
  constructor(private readonly service: KbttService) {}

  @Get("connection")
  @Header("Cache-Control", "no-store")
  @RequirePermission(["hotel.kbtt.view", "hotel.kbtt.declarations.view"])
  @ApiOperation({ summary: "View saved hotel KBTT connection; never contacts provider" })
  @ApiOkResponse({ schema: connectionSchema })
  get(@Req() request: RequestWithRequiredUser, @Param("hotelId") hotelId: string) {
    return this.service.get(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
    );
  }

  @Put("connection")
  @Header("Cache-Control", "no-store")
  @RequirePermission("hotel.kbtt.manage")
  @ApiOperation({ summary: "Authenticate and save encrypted hotel credentials only after success" })
  @ApiBody({
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["username", "password"],
      properties: {
        username: { type: "string", minLength: 1, maxLength: 120, writeOnly: true },
        password: { type: "string", minLength: 1, maxLength: 256, writeOnly: true },
      },
    },
  })
  @ApiOkResponse({ schema: connectionSchema })
  connect(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Body() body: unknown,
  ) {
    let credentials: KbttCredentials;
    try {
      credentials = parseWithZod(kbttCredentialsSchema, body);
    } catch {
      throw new BadRequestException("Dữ liệu kết nối KBTT không hợp lệ");
    }
    return this.service.connect(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      credentials,
    );
  }

  @Post("connection/check")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @RequirePermission("hotel.kbtt.manage")
  @ApiOperation({
    summary: "Manually authenticate saved credentials; refresh near expiry, otherwise re-login",
  })
  @ApiOkResponse({ schema: connectionSchema })
  check(@Req() request: RequestWithRequiredUser, @Param("hotelId") hotelId: string) {
    return this.service.check(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
    );
  }

  @Delete("connection")
  @Header("Cache-Control", "no-store")
  @RequirePermission("hotel.kbtt.manage")
  @ApiOperation({ summary: "Best-effort revoke and remove saved credentials and local tokens" })
  @ApiOkResponse({ schema: connectionSchema })
  disconnect(@Req() request: RequestWithRequiredUser, @Param("hotelId") hotelId: string) {
    return this.service.disconnect(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
    );
  }

  @Get("declarations")
  @Header("Cache-Control", "no-store")
  @RequirePermission("hotel.kbtt.declarations.view")
  @ApiOperation({ summary: "List active occupants combined with KBTT declaration status" })
  listDeclarations(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Query() query?: unknown,
  ) {
    const pagination = parseWithZod(kbttPaginationQuerySchema, query ?? {});
    return this.service.listDeclarations(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      pagination,
    );
  }

  @Get("declarations/:occupantId")
  @Header("Cache-Control", "no-store")
  @ApiParam({ name: "occupantId", type: String })
  @RequirePermission("hotel.kbtt.declarations.view")
  @ApiOperation({ summary: "Get occupant profile and latest KBTT declaration" })
  getDeclaration(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Param("occupantId") occupantId: string,
  ) {
    return this.service.getDeclaration(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      parseWithZod(occupantIdParamSchema, occupantId),
    );
  }

  @Put("declarations/:occupantId/draft")
  @Header("Cache-Control", "no-store")
  @ApiParam({ name: "occupantId", type: String })
  @RequirePermission("hotel.kbtt.declarations.manage")
  @ApiOperation({ summary: "Create or update KBTT declaration draft" })
  saveDraft(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Param("occupantId") occupantId: string,
    @Body() body: unknown,
  ) {
    return this.service.saveDraft(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      parseWithZod(occupantIdParamSchema, occupantId),
      body,
    );
  }

  @Post("declarations/:occupantId/submit")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiParam({ name: "occupantId", type: String })
  @RequirePermission("hotel.kbtt.declarations.manage")
  @ApiOperation({ summary: "Submit validated declaration to KBTT provider (API 4/5)" })
  submit(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Param("occupantId") occupantId: string,
  ) {
    return this.service.submit(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      parseWithZod(occupantIdParamSchema, occupantId),
    );
  }

  @Get("catalogs")
  @Header("Cache-Control", "no-store")
  @RequirePermission("hotel.kbtt.declarations.view")
  @ApiOperation({ summary: "List cached KBTT reference catalog items by query" })
  listCatalogByQuery(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Query("kind") kindParam: string,
    @Query() query?: unknown,
  ) {
    const validKind = parseWithZod(kbttCatalogKindSchema, kindParam);
    const validQuery = parseWithZod(kbttCatalogQuerySchema, query ?? {});
    return this.service.listCatalog(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      validKind,
      validQuery,
    );
  }

  @Get("catalogs/:kind")
  @Header("Cache-Control", "no-store")
  @ApiParam({
    name: "kind",
    enum: ["NATIONALITY", "PROVINCE", "WARD", "STAY_REASON", "DOCUMENT_TYPE", "RESIDENCE_PLACE"],
  })
  @RequirePermission("hotel.kbtt.declarations.view")
  @ApiOperation({ summary: "List cached KBTT reference catalog items" })
  listCatalog(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Param("kind") kind: string,
    @Query() query?: unknown,
  ) {
    const validKind = parseWithZod(kbttCatalogKindSchema, kind);
    const validQuery = parseWithZod(kbttCatalogQuerySchema, query ?? {});
    return this.service.listCatalog(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      validKind,
      validQuery,
    );
  }

  @Post("catalogs/sync")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @RequirePermission("hotel.kbtt.declarations.manage")
  @ApiOperation({
    summary: "Manually synchronize a reference catalog from provider into local cache by payload",
  })
  syncCatalogByBody(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Body() body?: unknown,
    @Query() query?: unknown,
  ) {
    const parsedBody = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const parsedQuery = (query && typeof query === "object" ? query : {}) as Record<
      string,
      unknown
    >;
    const kind = (parsedBody.kind || parsedQuery.kind) as string;
    const validKind = parseWithZod(kbttCatalogKindSchema, kind);
    const provinceCode = (
      (parsedBody.provinceCode ||
        parsedBody.parentCode ||
        parsedBody.maTT ||
        parsedQuery.provinceCode ||
        parsedQuery.parentCode ||
        parsedQuery.maTT ||
        "") as string
    ).trim();
    return this.service.syncCatalog(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      validKind,
      { provinceCode: provinceCode || undefined },
    );
  }

  @Post("catalogs/:kind/sync")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @ApiParam({
    name: "kind",
    enum: ["NATIONALITY", "PROVINCE", "WARD", "STAY_REASON", "DOCUMENT_TYPE", "RESIDENCE_PLACE"],
  })
  @RequirePermission("hotel.kbtt.declarations.manage")
  @ApiOperation({
    summary: "Manually synchronize a reference catalog from provider into local cache",
  })
  syncCatalog(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Param("kind") kind: string,
    @Body() body?: unknown,
    @Query() query?: unknown,
  ) {
    const validKind = parseWithZod(kbttCatalogKindSchema, kind);
    const parsedBody = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    const parsedQuery = (query && typeof query === "object" ? query : {}) as Record<
      string,
      unknown
    >;
    const provinceCode = (
      (parsedBody.provinceCode ||
        parsedBody.parentCode ||
        parsedBody.maTT ||
        parsedQuery.provinceCode ||
        parsedQuery.parentCode ||
        parsedQuery.maTT ||
        "") as string
    ).trim();
    return this.service.syncCatalog(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      validKind,
      { provinceCode: provinceCode || undefined },
    );
  }

  @Get("auto-submit")
  @RequirePermission("hotel.kbtt.manage")
  @ApiOperation({
    summary: "Get KBTT auto-submit schedule configuration and recent runs",
  })
  getAutoSubmitConfig(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
  ) {
    return this.service.getAutoSubmitConfig(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
    );
  }

  @Put("auto-submit")
  @RequirePermission("hotel.kbtt.manage")
  @ApiOperation({
    summary: "Update KBTT auto-submit schedule configuration",
  })
  updateAutoSubmitConfig(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Body() body: unknown,
  ) {
    const validConfig = parseWithZod(kbttAutoSubmitConfigSchema, body);
    return this.service.updateAutoSubmitConfig(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      validConfig,
    );
  }

  @Post("auto-submit/test")
  @RequirePermission("hotel.kbtt.declarations.manage")
  @ApiOperation({
    summary: "Trigger a test execution of KBTT auto-submit (defaults to dryRun=true)",
  })
  testAutoSubmit(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Query() query: unknown,
  ) {
    const validQuery = parseWithZod(kbttAutoSubmitTestQuerySchema, query);
    return this.service.testAutoSubmit(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      validQuery.dryRun,
    );
  }

  @Post("auto-submit/telegram-test")
  @RequirePermission("hotel.kbtt.manage")
  @ApiOperation({ summary: "Send a Telegram-only KBTT connectivity test; never contacts C06" })
  testTelegram(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
  ) {
    return this.service.testTelegram(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
    );
  }

  @Post("auto-submit/summary")
  @HttpCode(200)
  @RequirePermission("hotel.kbtt.declarations.manage")
  @ApiOperation({ summary: "Send aggregated batch submission summary to Telegram aggregate channel" })
  sendAutoSubmitSummary(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Body() body: unknown,
  ) {
    const valid = parseWithZod(kbttBatchSubmitSummarySchema, body);
    return this.service.sendBatchSummary(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      valid,
    );
  }

  @Post("declarations/batch-summary")
  @HttpCode(200)
  @RequirePermission("hotel.kbtt.declarations.manage")
  @ApiOperation({ summary: "Send aggregated batch submission summary to Telegram aggregate channel" })
  sendDeclarationsBatchSummary(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Body() body: unknown,
  ) {
    const valid = parseWithZod(kbttBatchSubmitSummarySchema, body);
    return this.service.sendBatchSummary(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      valid,
    );
  }

  @Post("auto-submit/schedule")
  @RequirePermission("hotel.kbtt.manage")
  @ApiOperation({ summary: "Schedule one KBTT auto-submit in 15 seconds" })
  scheduleAutoSubmit(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Body() body: unknown,
  ) {
    const valid = parseWithZod(kbttAutoSubmitScheduleSchema, body);
    return this.service.scheduleAutoSubmit(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      valid.mode === "dry-run",
    );
  }

  @Delete("auto-submit/schedule")
  @RequirePermission("hotel.kbtt.manage")
  @ApiOperation({ summary: "Cancel the pending one-shot KBTT auto-submit" })
  cancelScheduledAutoSubmit(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
  ) {
    return this.service.cancelScheduledAutoSubmit(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
    );
  }

  @Post("dev/reset-declarations")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @RequirePermission("hotel.kbtt.declarations.manage")
  @ApiOperation({
    summary: "[DEV] Reset all hotel declarations to DRAFT and optionally generate new identity numbers",
  })
  devResetDeclarations(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Body() body?: unknown,
  ) {
    const valid = parseWithZod(kbttDevResetSchema, body ?? {});
    return this.service.devResetDeclarations(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      valid,
    );
  }

  @Post("dev/update-occupants")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  @RequirePermission("hotel.kbtt.declarations.manage")
  @ApiOperation({
    summary: "[DEV] Intervene in DB to update occupant document numbers / details and optionally reset to DRAFT",
  })
  devUpdateOccupants(
    @Req() request: RequestWithRequiredUser,
    @Param("hotelId") hotelId: string,
    @Body() body: unknown,
  ) {
    const valid = parseWithZod(kbttDevUpdateOccupantsSchema, body);
    return this.service.devUpdateOccupants(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
      valid.occupants,
    );
  }
}


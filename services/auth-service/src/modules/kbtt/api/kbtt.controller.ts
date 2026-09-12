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
import { hotelIdParamSchema, kbttCredentialsSchema } from "../domain/schemas/kbtt.schema";

const connectionSchema = successEnvelopeSchema(
  {
    type: "object",
    additionalProperties: false,
    required: [
      "configured",
      "status",
      "maskedUsername",
      "csltId",
      "csltKhuVuc",
      "csltDonVi",
      "maTTCuaCslt",
      "maPxCuaCslt",
      "isCsltChinh",
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
      csltKhuVuc: { type: "integer", nullable: true },
      csltDonVi: { type: "integer", nullable: true },
      maTTCuaCslt: { type: "string", nullable: true },
      maPxCuaCslt: { type: "string", nullable: true },
      isCsltChinh: { type: "boolean", nullable: true },
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
@Controller("hotels/:hotelId/kbtt/connection")
export class KbttController {
  constructor(private readonly service: KbttService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  @RequirePermission("hotel.kbtt.view")
  @ApiOperation({ summary: "View saved hotel KBTT connection; never contacts provider" })
  @ApiOkResponse({ schema: connectionSchema })
  get(@Req() request: RequestWithRequiredUser, @Param("hotelId") hotelId: string) {
    return this.service.get(
      request.user.userId,
      request.user.roleId,
      parseWithZod(hotelIdParamSchema, hotelId),
    );
  }

  @Put()
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
    let credentials;
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

  @Post("check")
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

  @Delete()
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
}

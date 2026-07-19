import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  authLogoutDataSchema,
  authMeDataSchema,
  authTokensDataSchema,
  loginBodySchema,
  refreshTokenBodySchema as refreshTokenBodyOpenApiSchema,
  successEnvelopeSchema,
} from "../../../common/openapi/contract-schemas";
import { AuthRateLimit } from "../../../common/security/auth-rate-limit.decorator";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SkipAuthorization } from "../../../shared/decorators/skip-authorization.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import { AuthService, type AuthTokensResponse } from "../application/authentication.service";
import { LocalAuthGuard } from "../infrastructure/guards/local-auth.guard";
import type { AuthenticatedUser } from "../domain/authenticated-user";
import { refreshTokenBodySchema } from "../domain/schemas/auth.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @HttpCode(HttpStatus.OK)
  @SuccessMessage("Đăng nhập thành công")
  @ApiDescript("Đăng nhập")
  @ApiBody({ schema: loginBodySchema })
  @ApiOkResponse({
    description: "Bao phản hồi đăng nhập",
    schema: successEnvelopeSchema(authTokensDataSchema, 200, "Đăng nhập thành công"),
  })
  @AuthRateLimit("login")
  @Post("login")
  async login(@Req() request: RequestWithUser): Promise<AuthTokensResponse> {
    return this.authService.login(request.user);
  }

  @SuccessMessage("Làm mới token thành công")
  @ApiDescript("Làm mới phiên đăng nhập")
  @ApiBody({ schema: refreshTokenBodyOpenApiSchema })
  @ApiCreatedResponse({
    description: "Bao phản hồi làm mới token",
    schema: successEnvelopeSchema(authTokensDataSchema, 201, "Làm mới token thành công"),
  })
  @AuthRateLimit("refresh")
  @ApiHeader({
    name: "Idempotency-Key",
    required: false,
    description: "Stable key for retrying the same refresh request (maximum 64 characters)",
  })
  @Post("refresh")
  async refresh(
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey?: string,
  ): Promise<AuthTokensResponse> {
    const dto = parseWithZod(refreshTokenBodySchema, body);
    return this.authService.refresh(dto.refreshToken, this.normalizeIdempotencyKey(idempotencyKey));
  }

  @HttpCode(HttpStatus.OK)
  @SuccessMessage("Đăng xuất thành công")
  @ApiDescript("Đăng xuất")
  @ApiOkResponse({
    description: "Bao phản hồi đăng xuất",
    schema: successEnvelopeSchema(authLogoutDataSchema, 200, "Đăng xuất thành công"),
  })
  @Post("logout")
  async logout(@Req() request: RequestWithUser): Promise<{ success: true }> {
    if (request.user.sessionId) {
      await this.authService.logout(request.user.sessionId);
    }
    return { success: true };
  }

  @HttpCode(HttpStatus.OK)
  @SuccessMessage("Đăng xuất tất cả thiết bị thành công")
  @ApiDescript("Đăng xuất tất cả phiên")
  @ApiOkResponse({
    description: "Bao phản hồi đăng xuất tất cả phiên",
    schema: successEnvelopeSchema(
      authLogoutDataSchema,
      200,
      "Đăng xuất tất cả thiết bị thành công",
    ),
  })
  @Post("logout-all")
  async logoutAll(@Req() request: RequestWithUser): Promise<{ success: true }> {
    await this.authService.logoutAll(request.user.userId);
    return { success: true };
  }

  @SkipAuthorization()
  @SuccessMessage("Lấy hồ sơ thành công")
  @ApiDescript("Xem hồ sơ cá nhân")
  @ApiOkResponse({
    description: "Bao phản hồi hồ sơ",
    schema: successEnvelopeSchema(authMeDataSchema, 200, "Lấy hồ sơ thành công"),
  })
  @Get("me")
  async me(@Req() request: RequestWithUser) {
    return this.authService.getMe(request.user.userId, request.user.roleId);
  }

  private normalizeIdempotencyKey(value?: string): string | undefined {
    const normalized = value?.trim();
    if (!normalized) return undefined;
    if (!/^[A-Za-z0-9._:-]{1,64}$/.test(normalized)) {
      throw new BadRequestException({
        code: "AUTH_IDEMPOTENCY_KEY_INVALID",
        message: "Idempotency-Key must contain 1-64 safe ASCII characters",
      });
    }
    return normalized;
  }
}

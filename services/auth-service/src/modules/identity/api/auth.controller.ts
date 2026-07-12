import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiTags } from "@nestjs/swagger";
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
  @Post("refresh")
  async refresh(@Body() body: unknown): Promise<AuthTokensResponse> {
    const dto = parseWithZod(refreshTokenBodySchema, body);
    return this.authService.refresh(dto.refreshToken);
  }

  @HttpCode(HttpStatus.OK)
  @SuccessMessage("Đăng xuất thành công")
  @ApiDescript("Đăng xuất")
  @ApiBody({ schema: refreshTokenBodyOpenApiSchema })
  @ApiOkResponse({
    description: "Bao phản hồi đăng xuất",
    schema: successEnvelopeSchema(authLogoutDataSchema, 200, "Đăng xuất thành công"),
  })
  @Post("logout")
  async logout(@Body() body: unknown): Promise<{ success: true }> {
    const dto = parseWithZod(refreshTokenBodySchema, body);
    await this.authService.logout(dto.refreshToken);
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
    return this.authService.getMe(request.user.userId);
  }
}

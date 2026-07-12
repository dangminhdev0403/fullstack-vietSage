import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import {
  TENANT_USER_STATUS_ENUM,
  assignHotelUserRolesBodySchema as assignHotelUserRolesBodyOpenApiSchema,
  createHotelUserBodySchema as createHotelUserBodyOpenApiSchema,
  listHotelUsersDataSchema,
  revokeHotelUserRoleDataSchema,
  successEnvelopeSchema,
  tenantScopedHotelUserDataSchema,
  updateHotelUserStatusBodySchema as updateHotelUserStatusBodyOpenApiSchema,
} from "../../../common/openapi/contract-schemas";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import { HotelUsersService } from "../application/hotel-users.service";
import {
  assignHotelUserRolesBodySchema as assignHotelUserRolesBodyZodSchema,
  createHotelUserBodySchema as createHotelUserBodyZodSchema,
  listHotelUsersQuerySchema as listHotelUsersQueryZodSchema,
  roleIdParamSchema,
  tenantHintQuerySchema,
  updateHotelUserStatusBodySchema as updateHotelUserStatusBodyZodSchema,
  userIdParamSchema,
} from "../domain/schemas/hotel-users.schema";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("hotel-users")
@Controller("hotel-users")
export class HotelUsersController {
  constructor(private readonly hotelUsersService: HotelUsersService) {}

  @SuccessMessage("Tạo người dùng khách sạn thành công")
  @ApiDescript("Tạo người dùng")
  @ApiHeader({ name: "x-tenant-id", required: false, description: "Ghi đè đơn vị tùy chọn" })
  @ApiBody({ schema: createHotelUserBodyOpenApiSchema })
  @ApiCreatedResponse({
    description: "Bao phản hồi tạo người dùng khách sạn",
    schema: successEnvelopeSchema(
      tenantScopedHotelUserDataSchema,
      201,
      "Tạo người dùng khách sạn thành công",
    ),
  })
  @Post()
  async createHotelUser(
    @Req() request: RequestWithUser,
    @Body() body: unknown,
    @Headers("x-tenant-id") tenantIdHeader?: string,
  ) {
    const dto = parseWithZod(createHotelUserBodyZodSchema, body);

    return this.hotelUsersService.createHotelUser(request.user.userId, {
      ...dto,
      tenantId: this.resolveTenantHint(tenantIdHeader, dto.tenantId),
    });
  }

  @SuccessMessage("Lấy danh sách người dùng khách sạn thành công")
  @ApiDescript("Xem danh sách người dùng")
  @ApiHeader({ name: "x-tenant-id", required: false, description: "Ghi đè đơn vị tùy chọn" })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "status", required: false, enum: TENANT_USER_STATUS_ENUM })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiOkResponse({
    description: "Bao phản hồi danh sách người dùng khách sạn",
    schema: successEnvelopeSchema(
      listHotelUsersDataSchema,
      200,
      "Lấy danh sách người dùng khách sạn thành công",
    ),
  })
  @Get()
  async listHotelUsers(
    @Req() request: RequestWithUser,
    @Query() query: unknown,
    @Headers("x-tenant-id") tenantIdHeader?: string,
  ) {
    const parsedQuery = parseWithZod(listHotelUsersQueryZodSchema, query);

    return this.hotelUsersService.listHotelUsers(
      request.user.userId,
      this.resolveTenantHint(tenantIdHeader, parsedQuery.tenantId),
      parsedQuery,
    );
  }

  @SuccessMessage("Lấy thông tin người dùng khách sạn thành công")
  @ApiDescript("Xem chi tiết người dùng")
  @ApiParam({ name: "id", type: String })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiHeader({ name: "x-tenant-id", required: false, description: "Ghi đè đơn vị tùy chọn" })
  @ApiOkResponse({
    description: "Bao phản hồi thông tin người dùng khách sạn",
    schema: successEnvelopeSchema(
      tenantScopedHotelUserDataSchema,
      200,
      "Lấy thông tin người dùng khách sạn thành công",
    ),
  })
  @Get(":id")
  async getHotelUser(
    @Req() request: RequestWithUser,
    @Param("id") userIdParam: string,
    @Query("tenantId") tenantIdQuery?: string,
    @Headers("x-tenant-id") tenantIdHeader?: string,
  ) {
    const userId = parseWithZod(userIdParamSchema, userIdParam);
    const tenantHint = parseWithZod(tenantHintQuerySchema, { tenantId: tenantIdQuery }).tenantId;

    return this.hotelUsersService.getHotelUser(
      request.user.userId,
      this.resolveTenantHint(tenantIdHeader, tenantHint),
      userId,
    );
  }

  @SuccessMessage("Cập nhật trạng thái người dùng khách sạn thành công")
  @ApiDescript("Cập nhật trạng thái người dùng")
  @ApiParam({ name: "id", type: String })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiHeader({ name: "x-tenant-id", required: false, description: "Ghi đè đơn vị tùy chọn" })
  @ApiBody({ schema: updateHotelUserStatusBodyOpenApiSchema })
  @ApiOkResponse({
    description: "Bao phản hồi cập nhật trạng thái người dùng khách sạn",
    schema: successEnvelopeSchema(
      tenantScopedHotelUserDataSchema,
      200,
      "Cập nhật trạng thái người dùng khách sạn thành công",
    ),
  })
  @Patch(":id/status")
  async updateHotelUserStatus(
    @Req() request: RequestWithUser,
    @Param("id") userIdParam: string,
    @Body() body: unknown,
    @Query("tenantId") tenantIdQuery?: string,
    @Headers("x-tenant-id") tenantIdHeader?: string,
  ) {
    const userId = parseWithZod(userIdParamSchema, userIdParam);
    const dto = parseWithZod(updateHotelUserStatusBodyZodSchema, body);
    const tenantHint = parseWithZod(tenantHintQuerySchema, { tenantId: tenantIdQuery }).tenantId;

    return this.hotelUsersService.updateHotelUserStatus(
      request.user.userId,
      this.resolveTenantHint(tenantIdHeader, tenantHint),
      userId,
      dto,
    );
  }

  @SuccessMessage("Gán vai trò người dùng khách sạn thành công")
  @ApiDescript("Gán vai trò người dùng")
  @ApiParam({ name: "id", type: String })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiHeader({ name: "x-tenant-id", required: false, description: "Ghi đè đơn vị tùy chọn" })
  @ApiBody({ schema: assignHotelUserRolesBodyOpenApiSchema })
  @ApiCreatedResponse({
    description: "Bao phản hồi gán vai trò người dùng khách sạn",
    schema: successEnvelopeSchema(
      tenantScopedHotelUserDataSchema,
      201,
      "Gán vai trò người dùng khách sạn thành công",
    ),
  })
  @Post(":id/roles")
  async assignHotelUserRoles(
    @Req() request: RequestWithUser,
    @Param("id") userIdParam: string,
    @Body() body: unknown,
    @Query("tenantId") tenantIdQuery?: string,
    @Headers("x-tenant-id") tenantIdHeader?: string,
  ) {
    const userId = parseWithZod(userIdParamSchema, userIdParam);
    const dto = parseWithZod(assignHotelUserRolesBodyZodSchema, body);
    const tenantHint = parseWithZod(tenantHintQuerySchema, { tenantId: tenantIdQuery }).tenantId;

    return this.hotelUsersService.assignHotelUserRoles(
      request.user.userId,
      this.resolveTenantHint(tenantIdHeader, tenantHint),
      userId,
      dto,
    );
  }

  @SuccessMessage("Thu hồi vai trò người dùng khách sạn thành công")
  @ApiDescript("Thu hồi vai trò người dùng")
  @ApiParam({ name: "id", type: String })
  @ApiParam({ name: "roleId", type: String })
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiHeader({ name: "x-tenant-id", required: false, description: "Ghi đè đơn vị tùy chọn" })
  @ApiOkResponse({
    description: "Bao phản hồi thu hồi vai trò người dùng khách sạn",
    schema: successEnvelopeSchema(
      revokeHotelUserRoleDataSchema,
      200,
      "Thu hồi vai trò người dùng khách sạn thành công",
    ),
  })
  @Delete(":id/roles/:roleId")
  async revokeHotelUserRole(
    @Req() request: RequestWithUser,
    @Param("id") userIdParam: string,
    @Param("roleId") roleIdParam: string,
    @Query("tenantId") tenantIdQuery?: string,
    @Headers("x-tenant-id") tenantIdHeader?: string,
  ) {
    const userId = parseWithZod(userIdParamSchema, userIdParam);
    const roleId = parseWithZod(roleIdParamSchema, roleIdParam);
    const tenantHint = parseWithZod(tenantHintQuerySchema, { tenantId: tenantIdQuery }).tenantId;

    return this.hotelUsersService.revokeHotelUserRole(
      request.user.userId,
      this.resolveTenantHint(tenantIdHeader, tenantHint),
      userId,
      roleId,
    );
  }

  private resolveTenantHint(
    headerTenantId: string | undefined,
    fallbackTenantId: string | undefined,
  ): string | undefined {
    const normalizedHeader = headerTenantId?.trim();
    if (normalizedHeader) {
      return normalizedHeader;
    }

    const normalizedFallback = fallbackTenantId?.trim();
    return normalizedFallback || undefined;
  }
}

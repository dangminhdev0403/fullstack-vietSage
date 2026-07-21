import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiParam,
  ApiQuery,
  ApiTags,
} from "@nestjs/swagger";
import type { Request } from "express";
import {
  TENANT_USER_STATUS_ENUM,
  USER_STATUS_ENUM,
  createTenantOwnerBodySchema as createTenantOwnerBodyOpenApiSchema,
  listTenantOwnersDataSchema,
  successEnvelopeSchema,
  tenantOwnerDataSchema,
  updateTenantOwnerBodySchema as updateTenantOwnerBodyOpenApiSchema,
} from "../../../common/openapi/contract-schemas";
import { parseWithZod } from "../../../common/validation/parse-with-zod";
import { ApiDescript } from "../../../shared/decorators/api-descript.decorator";
import { SuccessMessage } from "../../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../../shared/security";
import {
  createTenantOwnerBodySchema,
  listTenantOwnersQuerySchema,
  tenantOwnerIdParamSchema,
  updateTenantOwnerBodySchema,
} from "../domain/schemas/tenant-owners.schema";
import { TenantOwnersService } from "../application/tenant-owners.service";

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("tenant-owners")
@Controller("tenant-owners")
export class TenantOwnersController {
  constructor(private readonly tenantOwnersService: TenantOwnersService) {}

  @SuccessMessage("Lấy danh sách chủ đơn vị thành công")
  @ApiDescript("Xem danh sách chủ đơn vị")
  @ApiQuery({ name: "tenantId", required: false, type: String })
  @ApiQuery({ name: "ownerStatus", required: false, enum: USER_STATUS_ENUM })
  @ApiQuery({ name: "tenantUserStatus", required: false, enum: TENANT_USER_STATUS_ENUM })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiOkResponse({
    description: "Bao phản hồi danh sách chủ đơn vị",
    schema: successEnvelopeSchema(
      listTenantOwnersDataSchema,
      200,
      "Lấy danh sách chủ đơn vị thành công",
    ),
  })
  @Get()
  async listTenantOwners(@Req() request: RequestWithUser, @Query() query: unknown) {
    const parsedQuery = parseWithZod(listTenantOwnersQuerySchema, query);
    return this.tenantOwnersService.listTenantOwners(request.user.userId, parsedQuery);
  }

  @SuccessMessage("Lấy danh sách lựa chọn đơn vị thành công")
  @ApiDescript("Xem danh sách đơn vị gọn cho dropdown")
  @Get("tenant-options")
  async listTenantOptions(@Req() request: RequestWithUser) {
    return this.tenantOwnersService.listTenantOptions(request.user.userId);
  }

  @SuccessMessage("Lấy thông tin chủ đơn vị thành công")
  @ApiDescript("Xem chi tiết chủ đơn vị")
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({
    description: "Bao phản hồi thông tin chủ đơn vị",
    schema: successEnvelopeSchema(
      tenantOwnerDataSchema,
      200,
      "Lấy thông tin chủ đơn vị thành công",
    ),
  })
  @Get(":id")
  async getTenantOwner(@Req() request: RequestWithUser, @Param("id") idParam: string) {
    const id = parseWithZod(tenantOwnerIdParamSchema, idParam);
    return this.tenantOwnersService.getTenantOwner(request.user.userId, id);
  }

  @SuccessMessage("Tạo chủ đơn vị thành công")
  @ApiDescript("Tạo chủ đơn vị")
  @ApiBody({ schema: createTenantOwnerBodyOpenApiSchema })
  @ApiCreatedResponse({
    description: "Bao phản hồi tạo chủ đơn vị",
    schema: successEnvelopeSchema(tenantOwnerDataSchema, 201, "Tạo chủ đơn vị thành công"),
  })
  @Post()
  async createTenantOwner(@Req() request: RequestWithUser, @Body() body: unknown) {
    const dto = parseWithZod(createTenantOwnerBodySchema, body);
    return this.tenantOwnersService.createTenantOwner(request.user.userId, dto);
  }

  @SuccessMessage("Cập nhật chủ đơn vị thành công")
  @ApiDescript("Cập nhật chủ đơn vị")
  @ApiParam({ name: "id", type: String })
  @ApiBody({ schema: updateTenantOwnerBodyOpenApiSchema })
  @ApiOkResponse({
    description: "Bao phản hồi cập nhật chủ đơn vị",
    schema: successEnvelopeSchema(tenantOwnerDataSchema, 200, "Cập nhật chủ đơn vị thành công"),
  })
  @Patch(":id")
  async updateTenantOwner(
    @Req() request: RequestWithUser,
    @Param("id") idParam: string,
    @Body() body: unknown,
  ) {
    const id = parseWithZod(tenantOwnerIdParamSchema, idParam);
    const dto = parseWithZod(updateTenantOwnerBodySchema, body);
    return this.tenantOwnersService.updateTenantOwner(request.user.userId, id, dto);
  }
}

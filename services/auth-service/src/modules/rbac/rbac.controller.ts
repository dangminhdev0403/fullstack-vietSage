import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from "@nestjs/common";
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
  createRoleBodySchema as createRoleBodyOpenApiSchema,
  deletedDataSchema,
  frontendNavigationRoleDataSchema,
  HTTP_METHOD_ENUM,
  permissionDataSchema,
  permissionModuleLookupListDataSchema,
  roleModulePermissionsBodySchema as roleModulePermissionsBodyOpenApiSchema,
  roleMenusDataSchema,
  rolePermissionModulePermissionsPageDataSchema,
  rolePermissionModuleSummaryDataSchema,
  rolePermissionModulePermissionsQuerySchema as rolePermissionModulePermissionsQueryOpenApiSchema,
  replaceRolePermissionsBodySchema as replaceRolePermissionsBodyOpenApiSchema,
  roleDataSchema,
  roleWithRelationsDataSchema,
  successEnvelopeSchema,
  updateRoleBodySchema as updateRoleBodyOpenApiSchema,
} from "../../common/openapi/contract-schemas";
import { parseWithZod } from "../../common/validation/parse-with-zod";
import { ApiDescript } from "../../shared/decorators/api-descript.decorator";
import { RequirePermission } from "../../shared/decorators/require-permission.decorator";
import { SkipAuthorization } from "../../shared/decorators/skip-authorization.decorator";
import { SuccessMessage } from "../../shared/decorators/success-message.decorator";
import type { AuthenticatedUser } from "../../shared/security";
import { RbacService } from "./rbac.service";
import {
  createRoleBodySchema as createRoleBodyZodSchema,
  listRolePermissionModulePermissionsQuerySchema as listRolePermissionModulePermissionsQueryZodSchema,
  listPermissionsQuerySchema as listPermissionsQueryZodSchema,
  permissionModuleKeyParamSchema as permissionModuleKeyParamZodSchema,
  roleModulePermissionsBodySchema as roleModulePermissionsBodyZodSchema,
  replaceRolePermissionsBodySchema as replaceRolePermissionsBodyZodSchema,
  updateRoleBodySchema as updateRoleBodyZodSchema,
} from "./schemas/rbac.schema";

const permissionArrayDataSchema = {
  type: "array",
  items: permissionDataSchema,
};

const rolePermissionModuleSummaryArrayDataSchema = {
  type: "array",
  items: rolePermissionModuleSummaryDataSchema,
};

interface RequestWithUser extends Request {
  user: AuthenticatedUser;
}

@ApiTags("rbac.roles")
@Controller("roles")
export class RolesController {
  constructor(private readonly rbacService: RbacService) {}

  @RequirePermission("platform.roles.manage")
  @SuccessMessage("Tạo vai trò thành công")
  @ApiDescript("Tạo vai trò")
  @ApiBody({ schema: createRoleBodyOpenApiSchema })
  @ApiCreatedResponse({
    description: "Bao phản hồi tạo vai trò",
    schema: successEnvelopeSchema(roleDataSchema, 201, "Tạo vai trò thành công"),
  })
  @Post()
  async createRole(@Body() body: unknown) {
    const dto = parseWithZod(createRoleBodyZodSchema, body);
    return this.rbacService.createRole(dto);
  }

  @RequirePermission("platform.roles.view")
  @SuccessMessage("Lấy danh sách vai trò thành công")
  @ApiDescript("Xem danh sách vai trò")
  @ApiOkResponse({
    description: "Bao phản hồi danh sách vai trò",
    schema: successEnvelopeSchema(
      {
        type: "array",
        items: frontendNavigationRoleDataSchema,
      },
      200,
      "Lấy danh sách vai trò thành công",
    ),
  })
  @Get()
  async listRoles() {
    return this.rbacService.listRoles();
  }

  @RequirePermission("platform.roles.view")
  @SuccessMessage("Lấy chi tiết vai trò thành công")
  @ApiDescript("Xem chi tiết vai trò")
  @ApiParam({ name: "name", type: String })
  @ApiOkResponse({
    description: "Bao phản hồi lấy vai trò theo tên",
    schema: successEnvelopeSchema(
      roleWithRelationsDataSchema,
      200,
      "Lấy chi tiết vai trò thành công",
    ),
  })
  @Get("by-name/:name")
  async getRoleByName(@Param("name") roleName: string) {
    return this.rbacService.getRoleByName(roleName);
  }

  @SkipAuthorization()
  @SuccessMessage("Lấy menu của vai trò thành công")
  @ApiDescript("Xem menu vai trò")
  @ApiOkResponse({
    description: "Bao phản hồi danh sách menu của vai trò",
    schema: successEnvelopeSchema(roleMenusDataSchema, 200, "Lấy menu của vai trò thành công"),
  })
  @Get("menus")
  async getRoleMenus(@Req() request: RequestWithUser) {
    return this.rbacService.getRoleMenus(request.user.roleId);
  }

  @SuccessMessage("Lấy chi tiết vai trò thành công")
  @ApiDescript("Xem chi tiết vai trò")
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({
    description: "Bao phản hồi lấy vai trò",
    schema: successEnvelopeSchema(
      roleWithRelationsDataSchema,
      200,
      "Lấy chi tiết vai trò thành công",
    ),
  })
  @Get(":id")
  async getRole(@Param("id") roleId: string) {
    return this.rbacService.getRole(roleId);
  }

  @RequirePermission("platform.roles.manage")
  @SuccessMessage("Cập nhật vai trò thành công")
  @ApiDescript("Cập nhật vai trò")
  @ApiParam({ name: "id", type: String })
  @ApiBody({ schema: updateRoleBodyOpenApiSchema })
  @ApiOkResponse({
    description: "Bao phản hồi cập nhật vai trò",
    schema: successEnvelopeSchema(roleDataSchema, 200, "Cập nhật vai trò thành công"),
  })
  @Patch(":id")
  async updateRole(@Param("id") roleId: string, @Body() body: unknown) {
    const dto = parseWithZod(updateRoleBodyZodSchema, body);
    return this.rbacService.updateRole(roleId, dto);
  }

  @RequirePermission("platform.roles.manage")
  @SuccessMessage("Tắt vai trò thành công")
  @ApiDescript("Tạm ngừng vai trò")
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({
    description: "Bao phản hồi tắt vai trò",
    schema: successEnvelopeSchema(roleDataSchema, 200, "Tắt vai trò thành công"),
  })
  @Post(":id/disable")
  async disableRole(@Param("id") roleId: string) {
    return this.rbacService.disableRole(roleId);
  }

  @RequirePermission("platform.roles.manage")
  @SuccessMessage("Xóa vai trò thành công")
  @ApiDescript("Xóa vai trò")
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({
    description: "Bao phản hồi xóa vai trò",
    schema: successEnvelopeSchema(deletedDataSchema, 200, "Xóa vai trò thành công"),
  })
  @Delete(":id")
  async deleteRole(@Param("id") roleId: string) {
    return this.rbacService.deleteRole(roleId);
  }

  @RequirePermission("platform.roles.view")
  @SuccessMessage("Lấy danh sách quyền của vai trò thành công")
  @ApiDescript("Xem danh sách phân quyền")
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({
    description: "Bao phản hồi danh sách quyền của vai trò",
    schema: successEnvelopeSchema(
      permissionArrayDataSchema,
      200,
      "Lấy danh sách quyền của vai trò thành công",
    ),
  })
  @Get(":id/permissions")
  async listRolePermissions(@Param("id") roleId: string) {
    return this.rbacService.listRolePermissions(roleId);
  }

  @RequirePermission("platform.roles.view")
  @SuccessMessage("Lấy danh sách nhóm quyền của vai trò thành công")
  @ApiDescript("Xem danh sách nhóm quyền")
  @ApiOkResponse({
    description: "Bao phản hồi danh sách nhóm quyền của vai trò",
    schema: successEnvelopeSchema(
      rolePermissionModuleSummaryArrayDataSchema,
      200,
      "Lấy danh sách nhóm quyền của vai trò thành công",
    ),
  })
  @Get("me/permission-modules")
  async listRolePermissionModules(@Req() request: RequestWithUser) {
    return this.rbacService.listRolePermissionModules(request.user.roleId);
  }

  @RequirePermission("platform.roles.view")
  @SuccessMessage("Lấy danh sách quyền theo trang của nhóm quyền thành công")
  @ApiDescript("Xem danh sách phân quyền")
  @ApiParam({ name: "moduleKey", type: String })
  @ApiQuery({
    name: "page",
    required: false,
    schema: rolePermissionModulePermissionsQueryOpenApiSchema.properties.page,
  })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: rolePermissionModulePermissionsQueryOpenApiSchema.properties.limit,
  })
  @ApiOkResponse({
    description: "Bao phản hồi danh sách quyền theo nhóm quyền của vai trò",
    schema: successEnvelopeSchema(
      rolePermissionModulePermissionsPageDataSchema,
      200,
      "Lấy danh sách quyền theo trang của nhóm quyền thành công",
    ),
  })
  @Get("me/permission-modules/:moduleKey/permissions")
  async listRolePermissionModulePermissions(
    @Req() request: RequestWithUser,
    @Param() params: unknown,
    @Query() query: unknown,
  ) {
    const parsedParams = parseWithZod(permissionModuleKeyParamZodSchema, params);
    const parsedQuery = parseWithZod(listRolePermissionModulePermissionsQueryZodSchema, query);

    return this.rbacService.listRolePermissionModulePermissions(
      request.user.roleId,
      parsedParams.moduleKey,
      parsedQuery,
    );
  }

  @RequirePermission("platform.roles.view")
  @SuccessMessage("Lấy danh sách nhóm quyền của vai trò thành công")
  @ApiDescript("Xem danh sách nhóm quyền")
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({
    description: "Bao phản hồi danh sách nhóm quyền của vai trò",
    schema: successEnvelopeSchema(
      rolePermissionModuleSummaryArrayDataSchema,
      200,
      "Lấy danh sách nhóm quyền của vai trò thành công",
    ),
  })
  @Get(":id/permission-modules")
  async listPermissionModulesForRole(@Param("id") roleId: string) {
    return this.rbacService.listRolePermissionModules(roleId);
  }

  @RequirePermission("platform.roles.view")
  @SuccessMessage("Lấy danh sách quyền theo trang của nhóm quyền thành công")
  @ApiDescript("Xem danh sách phân quyền")
  @ApiParam({ name: "id", type: String })
  @ApiParam({ name: "moduleKey", type: String })
  @ApiQuery({
    name: "page",
    required: false,
    schema: rolePermissionModulePermissionsQueryOpenApiSchema.properties.page,
  })
  @ApiQuery({
    name: "limit",
    required: false,
    schema: rolePermissionModulePermissionsQueryOpenApiSchema.properties.limit,
  })
  @ApiOkResponse({
    description: "Bao phản hồi danh sách quyền theo nhóm quyền của vai trò",
    schema: successEnvelopeSchema(
      rolePermissionModulePermissionsPageDataSchema,
      200,
      "Lấy danh sách quyền theo trang của nhóm quyền thành công",
    ),
  })
  @Get(":id/permission-modules/:moduleKey/permissions")
  async listPermissionModulePermissionsForRole(
    @Param("id") roleId: string,
    @Param("moduleKey") moduleKey: string,
    @Query() query: unknown,
  ) {
    const parsedParams = parseWithZod(permissionModuleKeyParamZodSchema, {
      moduleKey,
    });
    const parsedQuery = parseWithZod(listRolePermissionModulePermissionsQueryZodSchema, query);

    return this.rbacService.listRolePermissionModulePermissions(
      roleId,
      parsedParams.moduleKey,
      parsedQuery,
    );
  }

  @RequirePermission("platform.permissions.manage")
  @SuccessMessage("Cấp quyền theo nhóm quyền thành công")
  @ApiDescript("Cấp phân quyền")
  @ApiParam({ name: "roleId", type: String })
  @ApiParam({ name: "moduleKey", type: String })
  @ApiBody({ schema: roleModulePermissionsBodyOpenApiSchema })
  @ApiCreatedResponse({
    description: "Bao phản hồi cấp quyền theo nhóm quyền",
    schema: successEnvelopeSchema(
      rolePermissionModuleSummaryDataSchema,
      201,
      "Cấp quyền theo nhóm quyền thành công",
    ),
  })
  @Post(":roleId/modules/:moduleKey/permissions/grant")
  async grantRolePermissionModulePermissions(
    @Req() request: RequestWithUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const parsedParams = parseWithZod(permissionModuleRoleParamSchema, params);
    const dto = parseWithZod(roleModulePermissionsBodyZodSchema, body);

    return this.rbacService.grantRolePermissionModulePermissions(
      request.user.userId,
      parsedParams.roleId,
      parsedParams.moduleKey,
      dto,
    );
  }

  @RequirePermission("platform.permissions.manage")
  @SuccessMessage("Thu hồi quyền theo nhóm quyền thành công")
  @ApiDescript("Thu hồi phân quyền")
  @ApiParam({ name: "roleId", type: String })
  @ApiParam({ name: "moduleKey", type: String })
  @ApiBody({ schema: roleModulePermissionsBodyOpenApiSchema })
  @ApiCreatedResponse({
    description: "Bao phản hồi thu hồi quyền theo nhóm quyền",
    schema: successEnvelopeSchema(
      rolePermissionModuleSummaryDataSchema,
      201,
      "Thu hồi quyền theo nhóm quyền thành công",
    ),
  })
  @Post(":roleId/modules/:moduleKey/permissions/revoke")
  async revokeRolePermissionModulePermissions(
    @Req() request: RequestWithUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const parsedParams = parseWithZod(permissionModuleRoleParamSchema, params);
    const dto = parseWithZod(roleModulePermissionsBodyZodSchema, body);

    return this.rbacService.revokeRolePermissionModulePermissions(
      request.user.userId,
      parsedParams.roleId,
      parsedParams.moduleKey,
      dto,
    );
  }

  @RequirePermission("platform.permissions.manage")
  @SuccessMessage("Thay thế toàn bộ quyền của vai trò thành công")
  @ApiDescript("Cập nhật phân quyền")
  @ApiParam({ name: "id", type: String })
  @ApiBody({ schema: replaceRolePermissionsBodyOpenApiSchema })
  @ApiOkResponse({
    description: "Bao phản hồi thay thế quyền",
    schema: successEnvelopeSchema(
      permissionArrayDataSchema,
      200,
      "Thay thế toàn bộ quyền của vai trò thành công",
    ),
  })
  @Put(":id/permissions")
  async replacePermissions(@Param("id") roleId: string, @Body() body: unknown) {
    const dto = parseWithZod(replaceRolePermissionsBodyZodSchema, body);
    return this.rbacService.replacePermissions(roleId, dto);
  }
}

const permissionModuleRoleParamSchema = permissionModuleKeyParamZodSchema.extend({
  roleId: permissionModuleKeyParamZodSchema.shape.moduleKey,
});

@ApiTags("rbac.permissions")
@Controller("permissions")
export class PermissionsController {
  constructor(private readonly rbacService: RbacService) {}

  @RequirePermission("platform.roles.view")
  @SuccessMessage("Lấy danh sách quyền thành công")
  @ApiDescript("Xem danh sách phân quyền")
  @ApiQuery({ name: "method", required: false, enum: HTTP_METHOD_ENUM })
  @ApiQuery({ name: "path", required: false, type: String })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiOkResponse({
    description: "Bao phản hồi danh sách quyền",
    schema: successEnvelopeSchema(
      permissionModuleLookupListDataSchema,
      200,
      "Lấy danh sách quyền thành công",
    ),
  })
  @Get()
  async listPermissions(@Query() query: unknown) {
    const parsedQuery = parseWithZod(listPermissionsQueryZodSchema, query);
    return this.rbacService.listPermissions(parsedQuery);
  }

  @RequirePermission("platform.roles.view")
  @SuccessMessage("Lấy chi tiết quyền thành công")
  @ApiDescript("Xem chi tiết phân quyền")
  @ApiParam({ name: "id", type: String })
  @ApiOkResponse({
    description: "Bao phản hồi lấy quyền",
    schema: successEnvelopeSchema(permissionDataSchema, 200, "Lấy chi tiết quyền thành công"),
  })
  @Get(":id")
  async getPermission(@Param("id") permissionId: string) {
    return this.rbacService.getPermission(permissionId);
  }
}

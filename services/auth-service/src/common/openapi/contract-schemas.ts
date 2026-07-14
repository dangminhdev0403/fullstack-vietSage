export const USER_STATUS_ENUM = ["ACTIVE", "LOCKED", "DISABLED"] as const;
export const TENANT_USER_STATUS_ENUM = ["ACTIVE", "INVITED", "DISABLED"] as const;
export const ROLE_STATUS_ENUM = ["ACTIVE", "DISABLED"] as const;
export const HTTP_METHOD_ENUM = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;

export function successEnvelopeSchema(
  dataSchema: Record<string, unknown>,
  statusCode: number,
  messageExample: string,
) {
  return {
    type: "object",
    properties: {
      status: {
        type: "number",
        example: statusCode,
      },
      error: {
        type: "object",
        nullable: true,
        additionalProperties: true,
        example: null,
      },
      message: {
        type: "string",
        example: messageExample,
      },
      data: dataSchema,
    },
    required: ["status", "error", "message", "data"],
  };
}

export const healthDataSchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ok"] },
    service: { type: "string", example: "auth-service" },
    uptimeSeconds: { type: "number", example: 1234 },
    timestamp: { type: "string", format: "date-time" },
  },
  required: ["status", "service", "uptimeSeconds", "timestamp"],
};

export const loginBodySchema = {
  type: "object",
  properties: {
    email: { type: "string", format: "email" },
    password: { type: "string", minLength: 1 },
  },
  required: ["email", "password"],
};

export const refreshTokenBodySchema = {
  type: "object",
  properties: {
    refreshToken: { type: "string", minLength: 1 },
  },
  required: ["refreshToken"],
};

export const authTokensDataSchema = {
  type: "object",
  properties: {
    accessToken: { type: "string" },
    refreshToken: { type: "string" },
    tokenType: { type: "string", enum: ["Bearer"] },
    accessTtl: { type: "string", example: "15m" },
    refreshTtl: { type: "string", example: "7d" },
    accessExpiresAt: { type: "string", format: "date-time" },
    refreshExpiresAt: { type: "string", format: "date-time" },
    sessionId: { type: "string", format: "uuid" },
  },
  required: [
    "accessToken",
    "refreshToken",
    "tokenType",
    "accessTtl",
    "refreshTtl",
    "accessExpiresAt",
    "refreshExpiresAt",
    "sessionId",
  ],
};

export const authLogoutDataSchema = {
  type: "object",
  properties: {
    success: { type: "boolean", enum: [true] },
  },
  required: ["success"],
};

export const authMeDataSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    email: { type: "string", format: "email" },
    fullName: { type: "string" },
    status: { type: "string", enum: USER_STATUS_ENUM },
    roles: {
      type: "array",
      items: { type: "string" },
    },
    menus: {
      type: "array",
      items: { type: "string" },
    },
    permissions: {
      type: "array",
      items: { type: "string" },
    },
    tenants: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          code: { type: "string" },
          name: { type: "string" },
          status: { type: "string" },
        },
        required: ["id", "code", "name", "status"],
      },
    },
  },
  required: ["id", "email", "fullName", "status", "roles", "menus", "permissions", "tenants"],
};

export const roleDataSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    code: { type: "string" },
    name: { type: "string" },
    description: { type: "string", nullable: true },
    status: { type: "string", enum: ROLE_STATUS_ENUM },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
  required: ["id", "code", "name", "description", "status", "createdAt", "updatedAt"],
};

export const permissionDataSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    method: { type: "string", enum: HTTP_METHOD_ENUM },
    path: { type: "string" },
    description: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
  required: ["id", "method", "path", "description", "createdAt", "updatedAt"],
};

export const frontendNavigationRoleDataSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    description: { type: "string", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    name: { type: "string" },
    status: { type: "string", enum: ROLE_STATUS_ENUM },
    menus: {
      type: "array",
      items: { type: "string" },
    },
    enabledCount: { type: "number" },
  },
  required: ["id", "description", "createdAt", "name", "status", "menus", "enabledCount"],
};

export const roleMenusDataSchema = {
  type: "array",
  items: { type: "string" },
};

export const frontendPermissionItemDataSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    method: { type: "string", enum: HTTP_METHOD_ENUM },
    description: { type: "string" },
  },
  required: ["id", "method", "description"],
};

export const frontendPermissionModuleDataSchema = {
  type: "object",
  properties: {
    name: { type: "string" },
    permissions: {
      type: "array",
      items: frontendPermissionItemDataSchema,
    },
  },
  required: ["name", "permissions"],
};

export const permissionsByModuleDataSchema = {
  type: "object",
  additionalProperties: frontendPermissionModuleDataSchema,
};

export const permissionModuleLookupItemDataSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    module: { type: "string" },
    name: { type: "string" },
  },
  required: ["id", "module", "name"],
};

export const permissionModuleLookupListDataSchema = {
  type: "array",
  items: permissionModuleLookupItemDataSchema,
};

export const rolePermissionModuleSummaryDataSchema = {
  type: "object",
  properties: {
    moduleKey: { type: "string" },
    moduleName: { type: "string" },
    totalPermissions: { type: "number" },
    enabledCount: { type: "number" },
    disabledCount: { type: "number" },
    allSelected: { type: "boolean" },
    allDisabled: { type: "boolean" },
  },
  required: [
    "moduleKey",
    "moduleName",
    "totalPermissions",
    "enabledCount",
    "disabledCount",
    "allSelected",
    "allDisabled",
  ],
};

export const rolePermissionModulePermissionItemDataSchema = {
  type: "object",
  properties: {
    permissionId: { type: "string" },
    method: { type: "string", enum: HTTP_METHOD_ENUM },
    path: { type: "string" },
    description: { type: "string" },
    enabled: { type: "boolean" },
  },
  required: ["permissionId", "method", "path", "description", "enabled"],
};

export const rolePermissionModulePermissionsPageDataSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    limit: { type: "number" },
    total: { type: "number" },
    items: {
      type: "array",
      items: rolePermissionModulePermissionItemDataSchema,
    },
  },
  required: ["page", "limit", "total", "items"],
};
export const roleWithRelationsDataSchema = {
  type: "object",
  properties: {
    ...roleDataSchema.properties,
    rolePermissions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          roleId: { type: "string" },
          permissionId: { type: "string" },
          permission: permissionDataSchema,
        },
        required: ["id", "roleId", "permissionId", "permission"],
      },
    },
    _count: {
      type: "object",
      properties: {
        userRoles: { type: "number" },
        rolePermissions: { type: "number" },
      },
      required: ["userRoles", "rolePermissions"],
    },
  },
  required: [
    "id",
    "code",
    "name",
    "description",
    "status",
    "createdAt",
    "updatedAt",
    "rolePermissions",
    "_count",
  ],
};

export const createRoleBodySchema = {
  type: "object",
  properties: {
    code: { type: "string", minLength: 2, maxLength: 80 },
    name: { type: "string", minLength: 2, maxLength: 120 },
    description: { type: "string", maxLength: 255 },
  },
  required: ["code", "name"],
};

export const updateRoleBodySchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 2, maxLength: 120 },
    description: { type: "string", maxLength: 255 },
  },
};

export const replaceRolePermissionsBodySchema = {
  type: "object",
  properties: {
    permissionIds: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["permissionIds"],
};

export const roleModulePermissionsBodySchema = {
  type: "object",
  properties: {
    permissionIds: {
      type: "array",
      minItems: 1,
      items: { type: "string" },
    },
  },
  required: ["permissionIds"],
};

export const createHotelUserBodySchema = {
  type: "object",
  properties: {
    email: { type: "string", format: "email", maxLength: 320 },
    fullName: { type: "string", minLength: 2, maxLength: 120 },
    password: { type: "string", minLength: 8, maxLength: 128 },
    tenantId: { type: "string", maxLength: 80 },
    roleIds: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: { type: "string", maxLength: 64 },
    },
  },
  required: ["email", "fullName", "password"],
};

export const updateHotelUserStatusBodySchema = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["ACTIVE", "DISABLED"] },
  },
  required: ["status"],
};

export const assignHotelUserRolesBodySchema = {
  type: "object",
  properties: {
    roleIds: {
      type: "array",
      minItems: 1,
      maxItems: 20,
      items: { type: "string", maxLength: 64 },
    },
  },
  required: ["roleIds"],
};

export const tenantScopedHotelUserDataSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    email: { type: "string", format: "email" },
    fullName: { type: "string" },
    userStatus: { type: "string", enum: USER_STATUS_ENUM },
    tenantStatus: { type: "string", enum: TENANT_USER_STATUS_ENUM },
    tenantId: { type: "string" },
    joinedAt: { type: "string", format: "date-time", nullable: true },
    roles: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          code: { type: "string" },
          name: { type: "string" },
          assignedAt: { type: "string", format: "date-time" },
          assignedById: { type: "string", nullable: true },
        },
        required: ["id", "code", "name", "assignedAt", "assignedById"],
      },
    },
  },
  required: [
    "id",
    "email",
    "fullName",
    "userStatus",
    "tenantStatus",
    "tenantId",
    "joinedAt",
    "roles",
  ],
};

export const listHotelUsersDataSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    limit: { type: "number" },
    total: { type: "number" },
    items: {
      type: "array",
      items: tenantScopedHotelUserDataSchema,
    },
  },
  required: ["page", "limit", "total", "items"],
};

export const createTenantOwnerBodySchema = {
  type: "object",
  properties: {
    owner: {
      type: "object",
      properties: {
        fullName: { type: "string", minLength: 2, maxLength: 120 },
        email: { type: "string", format: "email", maxLength: 320 },
        password: { type: "string", minLength: 8, maxLength: 128 },
      },
      required: ["fullName", "email", "password"],
    },
    tenant: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 2, maxLength: 160 },
      },
      required: ["name"],
    },
  },
  required: ["owner", "tenant"],
};

export const updateTenantOwnerBodySchema = {
  type: "object",
  properties: {
    owner: {
      type: "object",
      properties: {
        fullName: { type: "string", minLength: 2, maxLength: 120 },
        status: { type: "string", enum: [...USER_STATUS_ENUM] },
      },
    },
    tenant: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 2, maxLength: 160 },
      },
    },
    tenantUserStatus: { type: "string", enum: [...TENANT_USER_STATUS_ENUM] },
  },
};

export const tenantOwnerDataSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    email: { type: "string", format: "email" },
    fullName: { type: "string" },
    status: { type: "string", enum: [...USER_STATUS_ENUM] },
    userType: { type: "string", example: "PARTNER" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    tenant: {
      type: "object",
      properties: {
        id: { type: "string" },
        code: { type: "string" },
        name: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: ["id", "code", "name", "createdAt", "updatedAt"],
    },
    tenantUser: {
      type: "object",
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: [...TENANT_USER_STATUS_ENUM] },
        joinedAt: { type: "string", format: "date-time", nullable: true },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: ["id", "status", "joinedAt", "createdAt", "updatedAt"],
    },
    role: {
      type: "object",
      properties: {
        id: { type: "string" },
        code: { type: "string", example: "TENANT_OWNER" },
        name: { type: "string" },
        assignedAt: { type: "string", format: "date-time" },
        assignedById: { type: "string", nullable: true },
      },
      required: ["id", "code", "name", "assignedAt", "assignedById"],
    },
  },
  required: [
    "id",
    "email",
    "fullName",
    "status",
    "userType",
    "createdAt",
    "updatedAt",
    "tenant",
    "tenantUser",
    "role",
  ],
};

export const listTenantOwnersDataSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    limit: { type: "number" },
    total: { type: "number" },
    items: {
      type: "array",
      items: tenantOwnerDataSchema,
    },
  },
  required: ["page", "limit", "total", "items"],
};

export const createHotelBodySchema = {
  type: "object",
  properties: {
    tenantId: { type: "string", maxLength: 80 },
    name: { type: "string", minLength: 2, maxLength: 160 },
    timezone: { type: "string", minLength: 1, maxLength: 80, default: "Asia/Saigon" },
    brandSettings: { type: "object", additionalProperties: true },
  },
  required: ["name"],
};

export const updateHotelBodySchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 2, maxLength: 160 },
    timezone: { type: "string", minLength: 1, maxLength: 80 },
    brandSettings: { type: "object", additionalProperties: true, nullable: true },
    status: { type: "string", enum: ["ACTIVE", "DISABLED"] },
  },
  minProperties: 1,
};

export const hotelDataSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    tenantId: { type: "string" },
    name: { type: "string" },
    code: { type: "string" },
    timezone: { type: "string" },
    status: { type: "string" },
    brandSettings: { type: "object", additionalProperties: true, nullable: true },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    tenant: {
      type: "object",
      nullable: true,
      properties: {
        id: { type: "string" },
        code: { type: "string" },
        name: { type: "string" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
      },
      required: ["id", "code", "name", "createdAt", "updatedAt"],
    },
  },
  required: [
    "id",
    "tenantId",
    "name",
    "code",
    "timezone",
    "status",
    "brandSettings",
    "createdAt",
    "updatedAt",
    "tenant",
  ],
};

export const listHotelsDataSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    limit: { type: "number" },
    total: { type: "number" },
    items: {
      type: "array",
      items: hotelDataSchema,
    },
  },
  required: ["page", "limit", "total", "items"],
};

export const revokeHotelUserRoleDataSchema = {
  type: "object",
  properties: {
    revoked: { type: "boolean", enum: [true] },
    userId: { type: "string" },
    roleId: { type: "string" },
  },
  required: ["revoked", "userId", "roleId"],
};

export const deletedDataSchema = {
  type: "object",
  properties: {
    deleted: { type: "boolean", enum: [true] },
  },
  required: ["deleted"],
};

export const permissionListQuerySchema = {
  type: "object",
  properties: {
    method: { type: "string", enum: HTTP_METHOD_ENUM },
    path: { type: "string", maxLength: 255 },
    q: { type: "string", maxLength: 255 },
  },
};

export const rolePermissionModulePermissionsQuerySchema = {
  type: "object",
  properties: {
    page: { type: "number", minimum: 1 },
    limit: { type: "number", minimum: 1, maximum: 100 },
  },
};

export const listHotelUsersQuerySchema = {
  type: "object",
  properties: {
    tenantId: { type: "string", maxLength: 80 },
    page: { type: "number", minimum: 1 },
    limit: { type: "number", minimum: 1, maximum: 100 },
    status: { type: "string", enum: TENANT_USER_STATUS_ENUM },
    q: { type: "string", maxLength: 120 },
  },
};

export const guestRequestPriorityEnum = ["NORMAL", "URGENT"] as const;
export const guestRequestStatusEnum = [
  "CREATED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "FAILED",
] as const;
export const serviceCatalogStatusEnum = ["ACTIVE", "DISABLED"] as const;

export const serviceItemQuantityPropertiesSchema = {
  quantityEnabled: {
    type: "boolean",
    description: "When true, guests must submit quantity within minQuantity/maxQuantity.",
  },
  minQuantity: {
    type: "integer",
    minimum: 1,
    description: "Minimum guest-selectable quantity when quantityEnabled is true.",
  },
  maxQuantity: {
    type: "integer",
    minimum: 1,
    nullable: true,
    description:
      "Maximum guest-selectable quantity when quantityEnabled is true. Null means no cap.",
  },
};

export const createServiceItemBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    categoryId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1, maxLength: 160 },
    description: { type: "string", maxLength: 1000 },
    priceOverride: { type: "number", minimum: 0 },
    ...serviceItemQuantityPropertiesSchema,
    metadata: { type: "object", additionalProperties: true },
    sortOrder: { type: "integer", minimum: 0 },
    status: { type: "string", enum: [...serviceCatalogStatusEnum] },
  },
  required: ["categoryId", "name"],
};

export const updateServiceItemBodySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    categoryId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1, maxLength: 160 },
    description: { type: "string", maxLength: 1000, nullable: true },
    priceOverride: { type: "number", minimum: 0, nullable: true },
    ...serviceItemQuantityPropertiesSchema,
    metadata: { type: "object", additionalProperties: true, nullable: true },
    sortOrder: { type: "integer", minimum: 0 },
    status: { type: "string", enum: [...serviceCatalogStatusEnum] },
  },
  minProperties: 1,
};

export const hotelServiceItemDataSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    hotelId: { type: "string" },
    categoryId: { type: "string" },
    name: { type: "string" },
    description: { type: "string", nullable: true },
    priceOverride: { type: "number", nullable: true },
    effectivePrice: { type: "number" },
    effectiveCurrency: { type: "string", example: "VND" },
    ...serviceItemQuantityPropertiesSchema,
    metadata: { type: "object", additionalProperties: true, nullable: true },
    sortOrder: { type: "integer" },
    status: { type: "string", enum: [...serviceCatalogStatusEnum] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    category: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        status: { type: "string", enum: [...serviceCatalogStatusEnum] },
        defaultPrice: { type: "number" },
        currency: { type: "string", example: "VND" },
      },
      required: ["id", "name", "status", "defaultPrice", "currency"],
    },
  },
  required: [
    "id",
    "hotelId",
    "categoryId",
    "name",
    "description",
    "priceOverride",
    "effectivePrice",
    "effectiveCurrency",
    "quantityEnabled",
    "minQuantity",
    "maxQuantity",
    "metadata",
    "sortOrder",
    "status",
    "createdAt",
    "updatedAt",
    "category",
  ],
};

export const listHotelServiceItemsDataSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    limit: { type: "number" },
    total: { type: "number" },
    items: { type: "array", items: hotelServiceItemDataSchema },
  },
  required: ["page", "limit", "total", "items"],
};

export const createGuestRequestBodySchema = {
  type: "object",
  additionalProperties: false,
  required: ["serviceItemId"],
  properties: {
    serviceItemId: { type: "string", minLength: 1 },
    description: { type: "string", maxLength: 1000 },
    details: { type: "string", maxLength: 1000 },
    quantity: {
      type: "integer",
      minimum: 1,
      description:
        "Required only when the selected service item has quantityEnabled=true. Ignored and stored as 1 otherwise.",
    },
    priority: { type: "string", enum: [...guestRequestPriorityEnum] },
    metadata: { type: "object", additionalProperties: true },
  },
};

export const guestRequestDataSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    service: {
      type: "object",
      properties: {
        id: { type: "string", nullable: true },
        name: { type: "string", nullable: true },
      },
      required: ["id", "name"],
    },
    status: { type: "string", enum: [...guestRequestStatusEnum] },
    priority: { type: "string", enum: [...guestRequestPriorityEnum] },
    quantity: { type: "integer", minimum: 1 },
    note: { type: "string", nullable: true },
    answer: { type: "string", nullable: true },
    createdAt: { type: "string", format: "date-time" },
  },
  required: ["id", "service", "status", "priority", "quantity", "note", "answer", "createdAt"],
};

export const guestRequestListItemDataSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    displayName: { type: "string" },
    status: { type: "string", enum: [...guestRequestStatusEnum] },
    priority: { type: "string", enum: [...guestRequestPriorityEnum] },
    quantity: { type: "integer", minimum: 1 },
    currency: { type: "string", example: "VND" },
    unitPrice: { type: "number" },
    estimatedTotalAmount: { type: "number" },
    service: {
      type: "object",
      nullable: true,
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        price: { type: "number" },
        currency: { type: "string", example: "VND" },
      },
      required: ["id", "name", "price", "currency"],
    },
    description: { type: "string", nullable: true },
    answer: { type: "string", nullable: true },
    createdAt: { type: "string", format: "date-time" },
    canCancel: { type: "boolean" },
  },
  required: [
    "id",
    "displayName",
    "status",
    "priority",
    "quantity",
    "currency",
    "unitPrice",
    "estimatedTotalAmount",
    "description",
    "answer",
    "createdAt",
    "canCancel",
  ],
};

export const listGuestRequestsDataSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    limit: { type: "number" },
    total: { type: "number" },
    items: { type: "array", items: guestRequestListItemDataSchema },
  },
  required: ["page", "limit", "total", "items"],
};

export const guestServiceItemDataSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    name: { type: "string" },
    description: { type: "string", nullable: true },
    price: { type: "number" },
    currency: { type: "string", example: "VND" },
    ...serviceItemQuantityPropertiesSchema,
  },
  required: [
    "id",
    "name",
    "description",
    "price",
    "currency",
    "quantityEnabled",
    "minQuantity",
    "maxQuantity",
  ],
};

export const listGuestCategoryServicesDataSchema = {
  type: "object",
  properties: {
    page: { type: "number" },
    limit: { type: "number" },
    total: { type: "number" },
    category: {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
        description: { type: "string", nullable: true },
      },
      required: ["id", "name", "description"],
    },
    services: { type: "array", items: guestServiceItemDataSchema },
  },
  required: ["page", "limit", "total", "category", "services"],
};

export const guestServiceCatalogDataSchema = {
  type: "object",
  properties: {
    hotelId: { type: "string" },
    categories: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          hotelId: { type: "string" },
          name: { type: "string" },
          description: { type: "string", nullable: true },
          defaultPrice: { type: "number" },
          currency: { type: "string", example: "VND" },
          sortOrder: { type: "integer" },
          status: { type: "string", enum: [...serviceCatalogStatusEnum] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                hotelId: { type: "string" },
                categoryId: { type: "string" },
                name: { type: "string" },
                description: { type: "string", nullable: true },
                priceOverride: { type: "number", nullable: true },
                effectivePrice: { type: "number" },
                effectiveCurrency: { type: "string", example: "VND" },
                ...serviceItemQuantityPropertiesSchema,
                metadata: { type: "object", additionalProperties: true, nullable: true },
                sortOrder: { type: "integer" },
                status: { type: "string", enum: [...serviceCatalogStatusEnum] },
                createdAt: { type: "string", format: "date-time" },
                updatedAt: { type: "string", format: "date-time" },
              },
              required: [
                "id",
                "hotelId",
                "categoryId",
                "name",
                "description",
                "priceOverride",
                "effectivePrice",
                "effectiveCurrency",
                "quantityEnabled",
                "minQuantity",
                "maxQuantity",
                "metadata",
                "sortOrder",
                "status",
                "createdAt",
                "updatedAt",
              ],
            },
          },
        },
        required: [
          "id",
          "hotelId",
          "name",
          "description",
          "defaultPrice",
          "currency",
          "sortOrder",
          "status",
          "createdAt",
          "updatedAt",
          "items",
        ],
      },
    },
  },
  required: ["hotelId", "categories"],
};

import type { operations } from "@/generated/openapi/v1";

export type AdminPage<TItem> = {
  page: number;
  limit: number;
  total: number;
  items: TItem[];
};

export type TenantOwnerListQuery = NonNullable<
  operations["TenantOwnersController_listTenantOwners"]["parameters"]["query"]
>;
export type TenantOwnerPage = operations["TenantOwnersController_listTenantOwners"]["responses"][200]["content"]["application/json"]["data"];
export type TenantOwner = TenantOwnerPage["items"][number];
export type TenantOwnerCreateInput = operations["TenantOwnersController_createTenantOwner"]["requestBody"]["content"]["application/json"];
export type TenantOwnerUpdateInput = operations["TenantOwnersController_updateTenantOwner"]["requestBody"]["content"]["application/json"];

export type TenantSummary = TenantOwner["tenant"];

export type HotelListQuery = {
  q?: string;
  limit?: number;
  page?: number;
  tenantId?: string;
};

export type Hotel = {
  id: string;
  tenantId: string;
  code?: string | null;
  name: string;
  timezone?: string | null;
  status?: string | null;
  brandSettings?: Record<string, unknown> | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  tenant?: TenantSummary | null;
};

export type CreateHotelInput = {
  tenantId?: string;
  name: string;
  timezone?: string;
  brandSettings?: Record<string, unknown>;
};

export type UpdateHotelInput = {
  name?: string;
  timezone?: string;
  brandSettings?: Record<string, unknown> | null;
  status?: "ACTIVE" | "DISABLED";
};

export type HotelsPage = AdminPage<Hotel>;

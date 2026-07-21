import type { DashboardNavItem } from "../types/workspace-navigation";

import type {
  WorkspaceDefinition,
  WorkspaceNavigationDefinition,
  WorkspacePersona,
  WorkspaceRegistry,
  WorkspaceRegistryExtension,
  WorkspaceWidgetDefinition,
} from "../types/workspace-registry";

export type { WorkspaceDefinition, WorkspaceWidgetDefinition } from "../types/workspace-registry";

const STAFF_PERSONAS: readonly WorkspacePersona[] = [
  "manager",
  "front_desk",
  "housekeeping",
  "maintenance",
  "food_beverage",
  "finance",
];

const WORKSPACE_DEFINITIONS: Record<WorkspacePersona, WorkspaceDefinition> = {
  platform_admin: { persona: "platform_admin", eyebrow: "Quản trị nền tảng", title: "Quản trị nền tảng", description: "Tenant, khách sạn, tài khoản và chính sách truy cập.", profileLabel: "Quản trị viên", homePath: "/admin/dashboard" },
  owner: { persona: "owner", eyebrow: "Điều hành tổng", title: "Điều hành danh mục khách sạn", description: "Hiệu suất, doanh thu và vận hành toàn bộ khách sạn thuộc tenant.", profileLabel: "Chủ khách sạn", homePath: "/owner/dashboard" },
  manager: { persona: "manager", eyebrow: "Quản lý khách sạn", title: "Điều hành khách sạn", description: "Theo dõi yêu cầu, phòng, dịch vụ và công việc theo khách sạn.", profileLabel: "Quản lý khách sạn", homePath: "/staff" },
  front_desk: { persona: "front_desk", eyebrow: "Bộ phận lễ tân", title: "Quầy lễ tân", description: "Ưu tiên khách lưu trú, hàng đợi yêu cầu và xử lý tại quầy.", profileLabel: "Lễ tân", homePath: "/staff" },
  housekeeping: { persona: "housekeeping", eyebrow: "Vận hành buồng phòng", title: "Vận hành buồng phòng", description: "Theo dõi và hoàn thành công việc buồng phòng được phân công.", profileLabel: "Buồng phòng", homePath: "/staff" },
  maintenance: { persona: "maintenance", eyebrow: "Vận hành kỹ thuật", title: "Vận hành kỹ thuật", description: "Theo dõi và xử lý yêu cầu kỹ thuật theo phạm vi khách sạn.", profileLabel: "Kỹ thuật", homePath: "/staff" },
  food_beverage: { persona: "food_beverage", eyebrow: "Vận hành ẩm thực", title: "Ẩm thực khách sạn", description: "Theo dõi yêu cầu ẩm thực và danh mục dịch vụ theo phạm vi khách sạn.", profileLabel: "Ẩm thực", homePath: "/staff" },
  finance: { persona: "finance", eyebrow: "Vận hành tài chính", title: "Tài chính khách sạn", description: "Theo dõi các công việc tài chính trong phạm vi được cấp.", profileLabel: "Tài chính", homePath: "/staff" },
};

const ROLE_ALIASES: Record<string, WorkspacePersona> = {
  SUPER_ADMIN: "platform_admin",
  ADMIN: "platform_admin",
  TENANT_OWNER: "owner",
  HOTEL_OWNER: "owner",
  HOTEL_MANAGER: "manager",
  HOTEL_FRONTDESK: "front_desk",
  HOUSEKEEPING: "housekeeping",
  HOTEL_HOUSEKEEPING: "housekeeping",
  MAINTENANCE: "maintenance",
  HOTEL_MAINTENANCE: "maintenance",
  HOTEL_FNB: "food_beverage",
  FINANCE: "finance",
  HOTEL_FINANCE: "finance",
};

const NAVIGATION: readonly WorkspaceNavigationDefinition[] = [
  { key: "admin.home", personas: ["platform_admin"], href: "/admin/dashboard", label: "Tổng quan nền tảng", icon: "dashboard", order: 10 },
  { key: "admin.hotels", personas: ["platform_admin"], href: "/admin/hotels", label: "Khách sạn", icon: "hotel", order: 20, anyCapabilities: ["platform.hotels.view", "platform.hotels.manage"] },
  { key: "admin.users", personas: ["platform_admin"], href: "/admin/users", label: "Người dùng", icon: "group", order: 30, anyCapabilities: ["platform.users.view", "platform.users.manage"] },
  { key: "admin.access", personas: ["platform_admin"], href: "/admin/roles", label: "Vai trò & quyền", icon: "verified_user", order: 40, anyCapabilities: ["platform.roles.view", "platform.roles.manage", "platform.permissions.manage"] },
  { key: "owner.home", personas: ["owner"], href: "/owner/dashboard", label: "Tổng quan danh mục", icon: "dashboard", order: 10 },
  { key: "owner.hotels", personas: ["owner"], href: "/owner/hotels", label: "Khách sạn", icon: "hotel", order: 20 },
  { key: "owner.staff", personas: ["owner"], href: "/owner/staff", label: "Nhân viên", icon: "group", order: 30, hideWhenHotelSelected: true, anyCapabilities: ["hotel.staff.view", "hotel.staff.manage"] },
  { key: "owner.hotel.overview", personas: ["owner"], href: "/owner/hotels/{hotelId}", label: "Thông tin khách sạn", icon: "hotel", order: 100, requiresHotel: true, anyCapabilities: ["hotel.dashboard.view"] },
  { key: "owner.hotel.rooms", personas: ["owner"], href: "/owner/hotels/{hotelId}/rooms", label: "Phòng & QR", icon: "bed", order: 110, requiresHotel: true, anyCapabilities: ["hotel.rooms.view", "hotel.rooms.manage", "hotel.rooms.qr.manage"] },
  { key: "owner.hotel.staff", personas: ["owner"], href: "/owner/staff?hotelId={hotelId}", label: "Nhân viên khách sạn", icon: "group", order: 120, requiresHotel: true, anyCapabilities: ["hotel.staff.view", "hotel.staff.manage"] },
  { key: "owner.hotel.requests", personas: ["owner"], href: "/owner/hotels/{hotelId}/requests", label: "Yêu cầu khách", icon: "assignment", order: 130, requiresHotel: true, anyCapabilities: ["hotel.requests.view", "hotel.requests.manage"] },
  { key: "owner.hotel.stays", personas: ["owner"], href: "/owner/hotels/{hotelId}/stay", label: "Lưu trú", icon: "hotel", order: 140, requiresHotel: true, anyCapabilities: ["hotel.stays.view", "hotel.stays.manage", "hotel.reservations.view", "hotel.reservations.manage"] },
  { key: "owner.hotel.services", personas: ["owner"], href: "/owner/hotels/{hotelId}/services", label: "Dịch vụ", icon: "concierge", order: 150, requiresHotel: true, anyCapabilities: ["hotel.services.view", "hotel.services.manage"] },
  { key: "owner.hotel.billing", personas: ["owner"], href: "/owner/hotels/{hotelId}/billing", label: "Thanh toán", icon: "inventory_2", order: 160, requiresHotel: true, anyCapabilities: ["hotel.billing.view", "hotel.billing.manage"] },
  { key: "staff.dashboard", personas: STAFF_PERSONAS, href: "/hotels/{hotelId}/dashboard", label: "Điều hành hôm nay", icon: "space_dashboard", order: 20, requiresHotel: true, anyCapabilities: ["hotel.dashboard.view"] },
  { key: "staff.rooms", personas: ["manager", "front_desk"], href: "/hotels/{hotelId}/rooms", label: "Phòng & check-in", icon: "bed", order: 30, requiresHotel: true, anyCapabilities: ["hotel.rooms.view", "hotel.stays.manage", "hotel.reservations.view", "hotel.reservations.manage"] },
  { key: "staff.requests", personas: STAFF_PERSONAS, href: "/hotels/{hotelId}/requests", label: "Yêu cầu công việc", labelByPersona: { front_desk: "Hàng đợi lễ tân" }, icon: "assignment", order: 50, requiresHotel: true, anyCapabilities: ["hotel.requests.view", "hotel.requests.manage"] },
  { key: "staff.billing", personas: ["manager", "front_desk", "finance"], href: "/hotels/{hotelId}/billing", label: "Thanh toán & doanh thu", icon: "payments", order: 60, requiresHotel: true, anyCapabilities: ["hotel.billing.view", "hotel.billing.manage"] },
  { key: "staff.services", personas: ["manager", "food_beverage", "finance"], href: "/hotels/{hotelId}/services", label: "Danh mục dịch vụ", icon: "room_service", order: 70, requiresHotel: true, anyCapabilities: ["hotel.services.view", "hotel.services.manage"] },
];

const WIDGETS: readonly WorkspaceWidgetDefinition[] = [
  { key: "platform.hotels", personas: ["platform_admin"], title: "Danh mục khách sạn", description: "Quản lý khách sạn trên toàn nền tảng.", icon: "hotel", href: "/admin/hotels", order: 10, size: "standard", anyCapabilities: ["platform.hotels.view", "platform.hotels.manage"] },
  { key: "platform.users", personas: ["platform_admin"], title: "Chủ sở hữu & tenant", description: "Quản lý tài khoản chủ sở hữu và phạm vi tổ chức.", icon: "group", href: "/admin/users", order: 20, size: "standard", anyCapabilities: ["platform.users.view", "platform.users.manage"] },
  { key: "platform.access", personas: ["platform_admin"], title: "Vai trò & quyền hạn", description: "Quản trị role template, capability và chính sách truy cập.", icon: "verified_user", href: "/admin/roles", order: 30, size: "standard", anyCapabilities: ["platform.roles.view", "platform.roles.manage", "platform.permissions.manage"] },
  { key: "requests.active", personas: STAFF_PERSONAS, title: "Yêu cầu đang hoạt động", description: "Các yêu cầu cần tiếp tục xử lý.", icon: "assignment", order: 10, size: "compact", requiresHotel: true, anyCapabilities: ["hotel.requests.view", "hotel.requests.manage"] },
  { key: "requests.new", personas: STAFF_PERSONAS, title: "Yêu cầu mới", description: "Các yêu cầu vừa được tạo.", icon: "notifications_active", order: 20, size: "compact", requiresHotel: true, anyCapabilities: ["hotel.requests.view", "hotel.requests.manage"] },
  { key: "services.categories", personas: ["manager", "food_beverage", "finance"], title: "Nhóm dịch vụ", description: "Số nhóm dịch vụ đang quản lý.", icon: "category", order: 30, size: "compact", requiresHotel: true, anyCapabilities: ["hotel.services.view", "hotel.services.manage"] },
  { key: "services.items", personas: ["manager", "food_beverage", "finance"], title: "Dịch vụ", description: "Số dịch vụ trong catalog.", icon: "room_service", order: 40, size: "compact", requiresHotel: true, anyCapabilities: ["hotel.services.view", "hotel.services.manage"] },
  { key: "requests.feed", personas: STAFF_PERSONAS, title: "Yêu cầu gần đây", description: "Hàng đợi công việc theo khách sạn.", icon: "view_list", order: 50, size: "wide", requiresHotel: true, anyCapabilities: ["hotel.requests.view", "hotel.requests.manage"] },
];

function normalizeRoleCode(roleCode: string): string {
  return roleCode.trim().toUpperCase();
}

function mergeByKey<T extends { key: string }>(base: readonly T[], additions: readonly T[], replaceExisting: boolean, kind: string): T[] {
  const result = new Map(base.map((item) => [item.key, item]));
  for (const item of additions) {
    if (result.has(item.key) && !replaceExisting) {
      throw new Error(`Workspace ${kind} key already exists: ${item.key}`);
    }
    result.set(item.key, item);
  }
  return [...result.values()];
}

export function createWorkspaceRegistry(extensions: readonly WorkspaceRegistryExtension[] = []): WorkspaceRegistry {
  let roleAliases = { ...ROLE_ALIASES };
  let navigation = [...NAVIGATION];
  let widgets = [...WIDGETS];

  for (const extension of extensions) {
    const replaceExisting = extension.replaceExisting === true;
    for (const [rawRoleCode, persona] of Object.entries(extension.roleAliases ?? {})) {
      const roleCode = normalizeRoleCode(rawRoleCode);
      if (roleAliases[roleCode] && !replaceExisting) {
        throw new Error(`Workspace role alias already exists: ${roleCode}`);
      }
      roleAliases = { ...roleAliases, [roleCode]: persona };
    }
    navigation = mergeByKey(navigation, extension.navigation ?? [], replaceExisting, "navigation");
    widgets = mergeByKey(widgets, extension.widgets ?? [], replaceExisting, "widget");
  }

  return Object.freeze({
    definitions: Object.freeze({ ...WORKSPACE_DEFINITIONS }),
    roleAliases: Object.freeze(roleAliases),
    navigation: Object.freeze(navigation.map((item) => Object.freeze({ ...item }))),
    widgets: Object.freeze(widgets.map((item) => Object.freeze({ ...item }))),
  });
}

export const workspaceRegistry = createWorkspaceRegistry();

function hasAnyCapability(permissions: readonly string[], required?: readonly string[]): boolean {
  return !required || required.some((capability) => permissions.includes(capability));
}

function resolvePath(path: `/${string}`, hotelId: string | null): `/${string}` | null {
  if (!path.includes("{hotelId}")) return path;
  if (!hotelId) return null;
  return path.replace("{hotelId}", encodeURIComponent(hotelId)) as `/${string}`;
}

export function resolveWorkspacePersona(roleCode: string, registry: WorkspaceRegistry = workspaceRegistry): WorkspacePersona | null {
  return registry.roleAliases[normalizeRoleCode(roleCode)] ?? null;
}

export function getWorkspaceDefinition(persona: WorkspacePersona, registry: WorkspaceRegistry = workspaceRegistry): WorkspaceDefinition {
  return registry.definitions[persona];
}

export function buildWorkspaceNavigation(input: { persona: WorkspacePersona; permissions: readonly string[]; hotelId?: string | null; registry?: WorkspaceRegistry }): DashboardNavItem[] {
  const { persona, permissions, hotelId = null, registry = workspaceRegistry } = input;

  return registry.navigation
    .filter((item) => item.personas.includes(persona))
    .filter((item) => hasAnyCapability(permissions, item.anyCapabilities))
    .filter((item) => !item.requiresHotel || Boolean(hotelId))
    .filter((item) => !item.hideWhenHotelSelected || !hotelId)
    .sort((first, second) => first.order - second.order)
    .flatMap((item) => {
      const resolvedPath = resolvePath(item.href, hotelId);
      if (!resolvedPath) return [];
      return [{ key: item.key, href: resolvedPath, label: item.labelByPersona?.[persona] ?? item.label, icon: item.icon }];
    });
}

export function buildWorkspaceNavigationForContext(input: {
  activeRole: { code: string };
  permissions: readonly string[];
  hotelId?: string | null;
  registry?: WorkspaceRegistry;
}): DashboardNavItem[] {
  const persona = resolveWorkspacePersona(input.activeRole.code, input.registry);
  if (!persona) return [];
  return buildWorkspaceNavigation({
    persona,
    permissions: input.permissions,
    hotelId: input.hotelId,
    registry: input.registry,
  });
}

export function getWorkspaceDashboardWidgets(input: { persona: WorkspacePersona; permissions: readonly string[]; hotelId?: string | null; registry?: WorkspaceRegistry }): WorkspaceWidgetDefinition[] {
  const { persona, permissions, hotelId = null, registry = workspaceRegistry } = input;
  return registry.widgets
    .filter((widget) => widget.personas.includes(persona))
    .filter((widget) => hasAnyCapability(permissions, widget.anyCapabilities))
    .filter((widget) => !widget.requiresHotel || Boolean(hotelId))
    .sort((first, second) => first.order - second.order);
}

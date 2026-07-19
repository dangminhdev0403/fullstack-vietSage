import type { DashboardNavItem } from "@/lib/frontend-navigation";

import type { WorkspacePersona } from "../utils/workspace-context";

export type WorkspaceDefinition = {
  persona: WorkspacePersona;
  eyebrow: string;
  title: string;
  description: string;
  profileLabel: string;
  homePath: `/${string}`;
};

const WORKSPACE_DEFINITIONS: Record<WorkspacePersona, WorkspaceDefinition> = {
  platform_admin: {
    persona: "platform_admin",
    eyebrow: "Platform control",
    title: "Quản trị nền tảng",
    description: "Tenant, khách sạn, tài khoản và chính sách truy cập.",
    profileLabel: "Quản trị viên",
    homePath: "/admin/dashboard",
  },
  owner: {
    persona: "owner",
    eyebrow: "Owner suite",
    title: "Điều hành danh mục khách sạn",
    description: "Hiệu suất, doanh thu và vận hành toàn bộ khách sạn thuộc tenant.",
    profileLabel: "Chủ khách sạn",
    homePath: "/owner/dashboard",
  },
  manager: {
    persona: "manager",
    eyebrow: "Hotel management",
    title: "Điều hành khách sạn",
    description: "Theo dõi yêu cầu, phòng, dịch vụ và công việc theo khách sạn.",
    profileLabel: "Quản lý khách sạn",
    homePath: "/staff/manager",
  },
  front_desk: {
    persona: "front_desk",
    eyebrow: "Front desk",
    title: "Quầy lễ tân",
    description: "Ưu tiên khách lưu trú, hàng đợi yêu cầu và xử lý tại quầy.",
    profileLabel: "Lễ tân",
    homePath: "/staff/front-desk",
  },
  housekeeping: {
    persona: "housekeeping",
    eyebrow: "Operations",
    title: "Vận hành buồng phòng",
    description: "Theo dõi và hoàn thành công việc buồng phòng được phân công.",
    profileLabel: "Buồng phòng",
    homePath: "/staff/operations",
  },
  maintenance: {
    persona: "maintenance",
    eyebrow: "Operations",
    title: "Vận hành kỹ thuật",
    description: "Theo dõi và xử lý yêu cầu kỹ thuật theo phạm vi khách sạn.",
    profileLabel: "Kỹ thuật",
    homePath: "/staff/operations",
  },
  finance: {
    persona: "finance",
    eyebrow: "Operations",
    title: "Tài chính khách sạn",
    description: "Theo dõi các công việc tài chính trong phạm vi được cấp.",
    profileLabel: "Tài chính",
    homePath: "/staff/operations",
  },
};

type NavigationCandidate = DashboardNavItem & {
  anyCapabilities?: readonly string[];
};

const ADMIN_NAVIGATION: readonly NavigationCandidate[] = [
  { key: "/admin/dashboard", href: "/admin/dashboard", label: "Tổng quan nền tảng", icon: "dashboard" },
  { key: "/admin/hotels", href: "/admin/hotels", label: "Khách sạn", icon: "hotel", anyCapabilities: ["platform.hotels.view", "platform.hotels.manage"] },
  { key: "/admin/users", href: "/admin/users", label: "Chủ sở hữu", icon: "group", anyCapabilities: ["platform.users.view", "platform.users.manage"] },
  { key: "/admin/roles", href: "/admin/roles", label: "Vai trò & quyền", icon: "verified_user", anyCapabilities: ["platform.roles.view", "platform.roles.manage", "platform.permissions.manage"] },
];

function hasAnyCapability(permissions: readonly string[], required?: readonly string[]): boolean {
  return !required || required.some((capability) => permissions.includes(capability));
}

function staffHomeItem(persona: WorkspacePersona, hotelId: string | null): DashboardNavItem {
  const definition = getWorkspaceDefinition(persona);
  const suffix = hotelId ? `?hotelId=${encodeURIComponent(hotelId)}` : "";
  return {
    key: definition.homePath,
    href: `${definition.homePath}${suffix}` as `/${string}`,
    label: "Tổng quan công việc",
    icon: "dashboard",
  };
}

export function getWorkspaceDefinition(persona: WorkspacePersona): WorkspaceDefinition {
  return WORKSPACE_DEFINITIONS[persona];
}

export function buildWorkspaceNavigation(input: {
  persona: WorkspacePersona;
  permissions: readonly string[];
  hotelId?: string | null;
}): DashboardNavItem[] {
  const { persona, permissions, hotelId = null } = input;

  if (persona === "platform_admin") {
    return ADMIN_NAVIGATION.filter((item) => hasAnyCapability(permissions, item.anyCapabilities)).map(
      (item) => ({
        key: item.key,
        href: item.href,
        label: item.label,
        icon: item.icon,
      }),
    );
  }

  if (persona === "owner") {
    return [
      { key: "/owner/dashboard", href: "/owner/dashboard", label: "Tổng quan", icon: "dashboard" },
      { key: "/owner/hotels", href: "/owner/hotels", label: "Khách sạn", icon: "hotel" },
      { key: "/owner/rooms", href: "/owner/rooms", label: "Phòng", icon: "bed" },
    ];
  }

  const navigation = [staffHomeItem(persona, hotelId)];
  if (!hotelId) {
    return navigation;
  }

  if (hasAnyCapability(permissions, ["hotel.requests.view", "hotel.requests.manage"])) {
    navigation.push({
      key: `/hotels/${hotelId}/requests`,
      href: `/hotels/${hotelId}/requests`,
      label: persona === "front_desk" ? "Hàng đợi lễ tân" : "Yêu cầu công việc",
      icon: "assignment",
    });
  }

  if (
    (persona === "manager" || persona === "finance") &&
    hasAnyCapability(permissions, ["hotel.services.view", "hotel.services.manage"])
  ) {
    navigation.push({
      key: `/hotels/${hotelId}/services`,
      href: `/hotels/${hotelId}/services`,
      label: "Danh mục dịch vụ",
      icon: "room_service",
    });
  }

  return navigation;
}

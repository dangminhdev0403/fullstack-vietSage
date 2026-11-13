import type {
  DashboardNavItem,
  DashboardNavSubItem,
} from "../types/workspace-navigation";

export function parseSidebarUrl(rawPath: string) {
  try {
    const parsed = new URL(rawPath, "https://vietsage.local");
    const pathname =
      parsed.pathname.length > 1 && parsed.pathname.endsWith("/")
        ? parsed.pathname.slice(0, -1)
        : parsed.pathname;
    const searchParams = parsed.searchParams;
    const tab = searchParams.get("tab")?.trim().toLowerCase();

    if (pathname === "/admin/dashboard" && tab === "permissions") {
      return { pathname: "/admin/permissions", searchParams: new URLSearchParams() };
    }

    return { pathname, searchParams };
  } catch {
    return { pathname: rawPath, searchParams: new URLSearchParams() };
  }
}

export function isNavItemActive(
  itemHref: string,
  activePath: string,
  allItems: readonly DashboardNavItem[] = []
): boolean {
  const item = parseSidebarUrl(itemHref);
  const active = parseSidebarUrl(activePath);

  if (item.pathname === active.pathname) {
    const itemParamEntries = Array.from(item.searchParams.entries());
    if (itemParamEntries.length > 0) {
      return itemParamEntries.every(
        ([key, val]) => active.searchParams.get(key) === val
      );
    }

    const hasSpecificMatchInItems = allItems.some((other) => {
      if (other.href === itemHref) return false;
      const otherParsed = parseSidebarUrl(other.href);
      if (otherParsed.pathname !== active.pathname) return false;
      const otherParamEntries = Array.from(otherParsed.searchParams.entries());
      if (otherParamEntries.length === 0) return false;
      return otherParamEntries.every(
        ([key, val]) => active.searchParams.get(key) === val
      );
    });

    return !hasSpecificMatchInItems;
  }

  if (Array.from(item.searchParams.keys()).length > 0) {
    return false;
  }

  if (active.pathname.startsWith(`${item.pathname}/`)) {
    const hasMoreSpecificMatch = allItems.some((other) => {
      if (other.href === itemHref) return false;
      const otherParsed = parseSidebarUrl(other.href);
      if (Array.from(otherParsed.searchParams.keys()).length > 0) return false;
      return (
        otherParsed.pathname.length > item.pathname.length &&
        (active.pathname === otherParsed.pathname ||
          active.pathname.startsWith(`${otherParsed.pathname}/`))
      );
    });

    return !hasMoreSpecificMatch;
  }

  return false;
}

export function isSubNavItemActive(
  subItem: DashboardNavSubItem,
  parentHref: string,
  activePath: string,
  siblings: readonly DashboardNavSubItem[] = [],
): boolean {
  const parent = parseSidebarUrl(parentHref);
  const active = parseSidebarUrl(activePath);

  if (parent.pathname !== active.pathname) {
    return false;
  }

  const paramName = subItem.paramName ?? "tab";
  const rawActiveVal = active.searchParams.get(paramName)?.trim().toLowerCase() ?? "";
  const subVal = subItem.tabValue.trim().toLowerCase();

  if (rawActiveVal) {
    if (rawActiveVal === subVal) {
      return true;
    }
    const anySiblingMatches = siblings.some(
      (sibling) =>
        (sibling.paramName ?? "tab") === paramName &&
        sibling.tabValue.trim().toLowerCase() === rawActiveVal,
    );
    if (!anySiblingMatches) {
      return Boolean(subItem.isDefault);
    }
    return false;
  }

  return Boolean(subItem.isDefault);
}

type SubNavCandidate = {
  key: string;
  label: string;
  tabValue: string;
  icon?: string;
  anyCapabilities?: readonly string[];
};

function getSubNavCandidatesForItem(
  item: DashboardNavItem,
  persona?: string,
): readonly SubNavCandidate[] {
  const basePath = parseSidebarUrl(item.href).pathname;

  if (
    item.key === "owner.hotel.billing" ||
    /^\/owner\/hotels\/[^/]+\/billing$/.test(basePath)
  ) {
    return [
      { key: "folios", label: "Hóa đơn lưu trú", tabValue: "folios", icon: "receipt_long" },
      { key: "receivables", label: "Sổ Công nợ Phải thu", tabValue: "receivables", icon: "account_balance_wallet" },
      { key: "expenses", label: "Chi phí vận hành", tabValue: "expenses", icon: "payments" },
      { key: "saas", label: "Đối soát Phí VietSage SaaS", tabValue: "saas", icon: "analytics" },
    ];
  }

  if (
    item.key === "owner.hotel.reports" ||
    item.key === "staff.reports" ||
    /^\/(?:owner\/)?hotels\/[^/]+\/reports$/.test(basePath)
  ) {
    return [
      { key: "overview", label: "Tổng quan & KPIs", tabValue: "overview", icon: "dashboard" },
      { key: "pnl", label: "Kết quả KD & Lãi lỗ", tabValue: "pnl", icon: "account_balance" },
      { key: "book", label: "Sổ doanh thu", tabValue: "book", icon: "receipt_long" },
      { key: "daily", label: "Doanh thu theo ngày", tabValue: "daily", icon: "calendar_today" },
      { key: "monthly", label: "Doanh thu theo tháng", tabValue: "monthly", icon: "calendar_month" },
      { key: "sources", label: "Kênh đặt phòng", tabValue: "sources", icon: "hub" },
      { key: "staff", label: "Thu ngân & Nhân viên", tabValue: "staff", icon: "badge" },
      { key: "demographics", label: "Nguồn khách & Quốc tịch", tabValue: "demographics", icon: "public" },
    ];
  }

  if (
    item.key === "owner.hotel.settings" ||
    /^\/owner\/hotels\/[^/]+\/settings$/.test(basePath)
  ) {
    return [
      {
        key: "rooms",
        label: "Cấu hình phòng",
        tabValue: "rooms",
        icon: "meeting_room",
        anyCapabilities: ["hotel.rooms.view", "hotel.rooms.manage", "hotel.rooms.qr.manage"],
      },
      {
        key: "staff",
        label: "Nhân viên & Phân công",
        tabValue: "staff",
        icon: "badge",
        anyCapabilities: ["hotel.staff.view", "hotel.staff.manage"],
      },
      {
        key: "services",
        label: "Danh mục dịch vụ",
        tabValue: "services",
        icon: "room_service",
        anyCapabilities: ["hotel.services.view", "hotel.services.manage"],
      },
      {
        key: "partners",
        label: "Đối tác liên kết",
        tabValue: "partners",
        icon: "handshake",
        anyCapabilities: ["hotel.local-partners.view", "hotel.local-partners.manage"],
      },
      {
        key: "integrations",
        label: "Tích hợp hệ thống",
        tabValue: "integrations",
        icon: "hub",
        anyCapabilities: [
          "hotel.kbtt.view",
          "hotel.kbtt.manage",
          "hotel.channels.view",
          "hotel.channels.manage",
        ],
      },
      {
        key: "confirmation-template",
        label: "Mẫu phiếu xác nhận",
        tabValue: "confirmation-template",
        icon: "receipt_long",
        anyCapabilities: ["hotel.reservations.view", "hotel.reservations.manage"],
      },
    ];
  }

  if (
    item.key === "owner.hotel.channel-manager" ||
    item.key === "staff.channel-manager" ||
    /^\/(?:owner\/)?hotels\/[^/]+\/channel-manager$/.test(basePath)
  ) {
    if (persona === "receptionist") {
      return [];
    }
    return [
      {
        key: "ari",
        label: "Giá & Quỹ phòng",
        tabValue: "ARI",
        icon: "bed",
        anyCapabilities: [
          "hotel.inventory.view",
          "hotel.inventory.manage",
          "hotel.channels.view",
          "hotel.channels.manage",
        ],
      },
      {
        key: "bookings",
        label: "Đơn đặt phòng OTA",
        tabValue: "BOOKINGS",
        icon: "concierge",
        anyCapabilities: [
          "hotel.reservations.view",
          "hotel.reservations.manage",
          "hotel.inventory.view",
          "hotel.inventory.manage",
          "hotel.channels.view",
          "hotel.channels.manage",
        ],
      },
      {
        key: "channels",
        label: "Kênh bán & Ánh xạ OTA",
        tabValue: "CHANNELS",
        icon: "hub",
        anyCapabilities: [
          "hotel.inventory.view",
          "hotel.inventory.manage",
          "hotel.channels.view",
          "hotel.channels.manage",
        ],
      },
    ];
  }

  if (
    item.key === "staff.front-desk" ||
    /^\/(?:owner\/)?hotels\/[^/]+\/front-desk$/.test(basePath)
  ) {
    return [
      {
        key: "in-house",
        label: "Khách đang lưu trú",
        tabValue: "in-house",
        icon: "person",
        anyCapabilities: ["hotel.rooms.view"],
      },
      {
        key: "arrivals",
        label: "Khách đặt trước",
        tabValue: "arrivals",
        icon: "calendar_today",
        anyCapabilities: ["hotel.reservations.view"],
      },
      {
        key: "groups",
        label: "Quản lý đoàn",
        tabValue: "groups",
        icon: "groups",
        anyCapabilities: ["hotel.reservations.view"],
      },
      {
        key: "kbtt",
        label: "Khai báo tạm trú",
        tabValue: "kbtt",
        icon: "verified_user",
        anyCapabilities: ["hotel.kbtt.declarations.view", "hotel.kbtt.declarations.manage"],
      },
    ];
  }

  if (
    item.key === "staff.services" ||
    /^\/hotels\/[^/]+\/services$/.test(basePath)
  ) {
    return [
      { key: "categories", label: "Nhóm dịch vụ", tabValue: "categories", icon: "category" },
      { key: "items", label: "Dịch vụ", tabValue: "items", icon: "room_service" },
    ];
  }

  if (
    item.key === "staff.partners" ||
    /^\/hotels\/[^/]+\/partners$/.test(basePath)
  ) {
    return [
      { key: "partners", label: "Mạng lưới đối tác", tabValue: "partners", icon: "handshake" },
      {
        key: "settlements",
        label: "Quyết toán công nợ",
        tabValue: "settlements",
        icon: "account_balance_wallet",
        anyCapabilities: ["hotel.local-partners.manage"],
      },
    ];
  }

  if (item.key === "admin.access" || basePath === "/admin/permissions") {
    return [
      { key: "roles", label: "Phân quyền vai trò", tabValue: "roles", icon: "admin_panel_settings" },
      { key: "catalog", label: "Danh mục quyền hệ thống", tabValue: "catalog", icon: "menu_book" },
    ];
  }

  if (item.key === "admin.billing" || basePath === "/admin/billing") {
    return [
      { key: "invoices", label: "Hóa đơn & Công nợ", tabValue: "invoices", icon: "receipt_long" },
      { key: "finalize", label: "Chốt kỳ theo tháng", tabValue: "finalize", icon: "bolt" },
      { key: "contracts", label: "Hợp đồng & Biểu phí", tabValue: "contracts", icon: "apartment" },
      { key: "localmate", label: "Biểu phí LocalMate", tabValue: "localmate", icon: "handshake" },
    ];
  }

  if (item.key === "admin.marketplace" || basePath === "/admin/marketplace") {
    return [
      { key: "partners", label: "Đối tác dịch vụ", tabValue: "partners", icon: "domain" },
      { key: "categories", label: "Danh mục dịch vụ", tabValue: "categories", icon: "storefront" },
    ];
  }

  if (item.key === "admin.users" || basePath === "/admin/users") {
    return [
      { key: "owners", label: "Chủ đơn vị", tabValue: "owners", icon: "group" },
      {
        key: "staff",
        label: "Nhân viên khách sạn",
        tabValue: "staff",
        icon: "badge",
        anyCapabilities: ["hotel.staff.view", "hotel.staff.manage"],
      },
    ];
  }

  return [];
}

export function resolveWorkspaceSubNavigation(
  items: readonly DashboardNavItem[],
  options?: {
    persona?: string;
    permissions?: readonly string[];
  },
): DashboardNavItem[] {
  const permissionList = options?.permissions ?? [];
  const hasPermissionFilter = permissionList.length > 0;
  const permissionSet = new Set(permissionList);

  return items.map((item) => {
    if (item.children && item.children.length > 0) {
      return item;
    }

    const candidates = getSubNavCandidatesForItem(item, options?.persona);
    if (candidates.length === 0) {
      return item;
    }

    const visibleCandidates = hasPermissionFilter
      ? candidates.filter(
          (candidate) =>
            !candidate.anyCapabilities ||
            candidate.anyCapabilities.length === 0 ||
            candidate.anyCapabilities.some((cap) => permissionSet.has(cap)),
        )
      : candidates;

    if (visibleCandidates.length <= 1) {
      return item;
    }

    const basePath = parseSidebarUrl(item.href).pathname;
    const children: DashboardNavSubItem[] = visibleCandidates.map(
      (candidate, index) => ({
        key: `${item.key}.${candidate.key}`,
        label: candidate.label,
        href: `${basePath}?tab=${encodeURIComponent(candidate.tabValue)}` as `/${string}`,
        icon: candidate.icon,
        tabValue: candidate.tabValue,
        paramName: "tab",
        isDefault: index === 0,
      }),
    );

    return {
      ...item,
      children,
    };
  });
}


import type { RolePermissionsBrowserPermission } from "../permission-types";

export type PermissionModuleId =
  | "FRONTDESK"
  | "ROOMS"
  | "BILLING"
  | "KBTT"
  | "REQUESTS"
  | "MESSAGES"
  | "CHANNELS"
  | "HOTEL_ADMIN"
  | "PLATFORM_ADMIN"
  | "OTHER";

export type PermissionActionType = "READ" | "WRITE" | "CRITICAL";

export type CategorizedPermission = RolePermissionsBrowserPermission & {
  moduleId: PermissionModuleId;
  actionType: PermissionActionType;
  actionLabel: string;
};

export type PermissionModuleConfig = {
  id: PermissionModuleId;
  name: string;
  icon: string;
  description: string;
  tagColor: {
    bg: string;
    text: string;
    border: string;
    badgeBg: string;
  };
};

export const PERMISSION_MODULES: Record<PermissionModuleId, PermissionModuleConfig> = {
  FRONTDESK: {
    id: "FRONTDESK",
    name: "Lễ tân & Đặt phòng",
    icon: "hotel",
    description: "Đặt phòng, phân bổ buồng phòng, thủ tục check-in / check-out và quản lý khách lưu trú",
    tagColor: {
      bg: "bg-blue-50/70",
      text: "text-blue-900",
      border: "border-blue-200/80",
      badgeBg: "bg-blue-100/80 text-blue-800",
    },
  },
  ROOMS: {
    id: "ROOMS",
    name: "Buồng phòng & Cơ sở",
    icon: "bed",
    description: "Quản lý danh sách phòng, trạng thái buồng phòng, vệ sinh và mã QR kích hoạt cửa",
    tagColor: {
      bg: "bg-teal-50/70",
      text: "text-teal-900",
      border: "border-teal-200/80",
      badgeBg: "bg-teal-100/80 text-teal-800",
    },
  },
  BILLING: {
    id: "BILLING",
    name: "Thu ngân & Thanh toán",
    icon: "payments",
    description: "Quản lý dòng tiền, giao dịch thanh toán, quyết toán hóa đơn trả phòng và đối soát",
    tagColor: {
      bg: "bg-amber-50/70",
      text: "text-amber-900",
      border: "border-amber-200/80",
      badgeBg: "bg-amber-100/80 text-amber-800",
    },
  },
  KBTT: {
    id: "KBTT",
    name: "Khai báo tạm trú (KBTT)",
    icon: "fact_check",
    description: "Kết nối cổng dịch vụ công, lập hồ sơ và nộp báo cáo lưu trú tự động cho cơ quan chức năng",
    tagColor: {
      bg: "bg-indigo-50/70",
      text: "text-indigo-900",
      border: "border-indigo-200/80",
      badgeBg: "bg-indigo-100/80 text-indigo-800",
    },
  },
  REQUESTS: {
    id: "REQUESTS",
    name: "Yêu cầu khách & Dịch vụ",
    icon: "room_service",
    description: "Tiếp nhận, điều phối, phục vụ phòng và thực thi các yêu cầu trải nghiệm của khách",
    tagColor: {
      bg: "bg-emerald-50/70",
      text: "text-emerald-900",
      border: "border-emerald-200/80",
      badgeBg: "bg-emerald-100/80 text-emerald-800",
    },
  },
  MESSAGES: {
    id: "MESSAGES",
    name: "Tin nhắn & Thông báo",
    icon: "chat",
    description: "Tương tác trò chuyện với khách phòng, trao đổi nội bộ và cấu hình thông báo hệ thống",
    tagColor: {
      bg: "bg-cyan-50/70",
      text: "text-cyan-900",
      border: "border-cyan-200/80",
      badgeBg: "bg-cyan-100/80 text-cyan-800",
    },
  },
  CHANNELS: {
    id: "CHANNELS",
    name: "Kênh bán OTA & Đối tác",
    icon: "storefront",
    description: "Đồng bộ kênh bán Channex (OTA), thị trường Marketplace và liên kết dịch vụ địa phương",
    tagColor: {
      bg: "bg-purple-50/70",
      text: "text-purple-900",
      border: "border-purple-200/80",
      badgeBg: "bg-purple-100/80 text-purple-800",
    },
  },
  HOTEL_ADMIN: {
    id: "HOTEL_ADMIN",
    name: "Vận hành & Nhân sự",
    icon: "apartment",
    description: "Tổng quan dashboard, hồ sơ cơ sở lưu trú, phân công ca trực và bảo vệ doanh thu",
    tagColor: {
      bg: "bg-sky-50/70",
      text: "text-sky-900",
      border: "border-sky-200/80",
      badgeBg: "bg-sky-100/80 text-sky-800",
    },
  },
  PLATFORM_ADMIN: {
    id: "PLATFORM_ADMIN",
    name: "Quản trị nền tảng",
    icon: "shield",
    description: "Quản trị người dùng hệ thống, cấu hình vai trò nâng cao và phân quyền nền tảng",
    tagColor: {
      bg: "bg-slate-50/70",
      text: "text-slate-900",
      border: "border-slate-200/80",
      badgeBg: "bg-slate-100/80 text-slate-800",
    },
  },
  OTHER: {
    id: "OTHER",
    name: "Quyền hạn khác",
    icon: "key",
    description: "Các quyền hạn bổ sung và tiện ích mở rộng trong hệ thống",
    tagColor: {
      bg: "bg-gray-50/70",
      text: "text-gray-900",
      border: "border-gray-200/80",
      badgeBg: "bg-gray-100/80 text-gray-800",
    },
  },
};

export function classifyPermissionModule(
  perm: RolePermissionsBrowserPermission,
): PermissionModuleId {
  const text = `${perm.description} ${perm.path} ${perm.id}`.toLowerCase();

  // Khai báo tạm trú (KBTT)
  if (text.includes("tạm trú") || text.includes("khai báo") || text.includes("kbtt")) {
    return "KBTT";
  }

  // Thu ngân & Thanh toán
  if (
    text.includes("thanh toán") ||
    text.includes("quyết toán") ||
    text.includes("billing") ||
    text.includes("payment") ||
    text.includes("doanh thu")
  ) {
    return "BILLING";
  }

  // Lễ tân & Đặt phòng
  if (
    text.includes("đặt phòng") ||
    text.includes("check-in") ||
    text.includes("check-out") ||
    text.includes("lưu trú") ||
    text.includes("gán phòng") ||
    text.includes("reservation") ||
    text.includes("stay")
  ) {
    return "FRONTDESK";
  }

  // Buồng phòng & Cơ sở vật chất
  if (
    text.includes("buồng phòng") ||
    text.includes("danh sách phòng") ||
    text.includes("quản lý phòng") ||
    text.includes("mã qr") ||
    text.includes("housekeeping")
  ) {
    return "ROOMS";
  }

  // Yêu cầu khách & Dịch vụ
  if (
    text.includes("yêu cầu khách") ||
    text.includes("dịch vụ") ||
    text.includes("thực thi yêu cầu") ||
    text.includes("điều phối") ||
    text.includes("request")
  ) {
    return "REQUESTS";
  }

  // Tin nhắn & Thông báo
  if (
    text.includes("tin nhắn") ||
    text.includes("thông báo") ||
    text.includes("message") ||
    text.includes("notification")
  ) {
    return "MESSAGES";
  }

  // Kênh bán OTA & Đối tác
  if (
    text.includes("kênh") ||
    text.includes("channel") ||
    text.includes("ota") ||
    text.includes("marketplace") ||
    text.includes("localmate") ||
    text.includes("đối tác")
  ) {
    return "CHANNELS";
  }

  // Vận hành & Nhân sự
  if (
    text.includes("tổng quan khách sạn") ||
    text.includes("hồ sơ khách sạn") ||
    text.includes("nhân viên") ||
    text.includes("phân công") ||
    text.includes("dashboard") ||
    text.includes("bảo vệ doanh thu")
  ) {
    return "HOTEL_ADMIN";
  }

  // Quản trị nền tảng
  if (
    text.includes("nền tảng") ||
    text.includes("platform") ||
    text.includes("người dùng") ||
    text.includes("vai trò") ||
    text.includes("phân quyền")
  ) {
    return "PLATFORM_ADMIN";
  }

  return "OTHER";
}

export function classifyPermissionAction(
  perm: RolePermissionsBrowserPermission,
): { actionType: PermissionActionType; actionLabel: string } {
  const desc = perm.description.toLowerCase();
  const method = (perm.method || "").toUpperCase();

  // Critical operations
  if (
    desc.includes("quyết toán") ||
    desc.includes("xóa") ||
    desc.includes("hoàn tất thanh toán") ||
    desc.includes("critical")
  ) {
    return { actionType: "CRITICAL", actionLabel: "Quyết toán / Trọng yếu" };
  }

  // Read-only operations
  if (
    desc.startsWith("xem ") ||
    desc.includes("danh sách") ||
    desc.includes("tra cứu") ||
    method === "GET"
  ) {
    // If it also says "quản lý", check which comes first
    if (!desc.startsWith("quản lý") && !desc.startsWith("thực hiện") && !desc.startsWith("xử lý")) {
      return { actionType: "READ", actionLabel: "Chỉ đọc / Tra cứu" };
    }
  }

  // Write / Manage operations
  return { actionType: "WRITE", actionLabel: "Thao tác / Quản lý" };
}

export function categorizePermissions(
  permissions: RolePermissionsBrowserPermission[],
): CategorizedPermission[] {
  return permissions.map((perm) => {
    const moduleId = classifyPermissionModule(perm);
    const { actionType, actionLabel } = classifyPermissionAction(perm);
    return {
      ...perm,
      moduleId,
      actionType,
      actionLabel,
    };
  });
}

export type BusinessPermissionRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type D3BoundedContextKey =
  | "identity"
  | "property"
  | "billing"
  | "marketplace"
  | "channel-manager"
  | "guest"
  | "kbtt"
  | "system";

export type D3CatalogPermission = {
  key: string;
  label: string;
  description: string;
  bounded_context: D3BoundedContextKey;
  risk: BusinessPermissionRisk;
};

export type D3BoundedContextConfig = {
  key: D3BoundedContextKey;
  name: string;
  shortName: string;
  icon: string;
  description: string;
  color: {
    bg: string;
    text: string;
    border: string;
    badgeBg: string;
  };
};

export const D3_BOUNDED_CONTEXTS: Record<D3BoundedContextKey, D3BoundedContextConfig> = {
  identity: {
    key: "identity",
    name: "Định danh & Kiểm soát truy cập",
    shortName: "Định danh",
    icon: "shield_person",
    description: "Quản trị người dùng, vai trò phân quyền và danh mục quyền hệ thống nền tảng",
    color: {
      bg: "bg-purple-50/70",
      text: "text-purple-900",
      border: "border-purple-200/80",
      badgeBg: "bg-purple-100/80 text-purple-800",
    },
  },
  property: {
    key: "property",
    name: "Vận hành Khách sạn & Cơ sở",
    shortName: "Khách sạn",
    icon: "apartment",
    description: "Quản lý buồng phòng, đặt phòng, thủ tục check-in / check-out và phân công nhân sự",
    color: {
      bg: "bg-teal-50/70",
      text: "text-teal-900",
      border: "border-teal-200/80",
      badgeBg: "bg-teal-100/80 text-teal-800",
    },
  },
  billing: {
    key: "billing",
    name: "Tài chính & Quyết toán",
    shortName: "Tài chính",
    icon: "payments",
    description: "Quản lý dòng tiền, giao dịch thanh toán, quyết toán hóa đơn trả phòng và đối soát doanh thu",
    color: {
      bg: "bg-amber-50/70",
      text: "text-amber-950",
      border: "border-amber-200/80",
      badgeBg: "bg-amber-100/80 text-amber-900",
    },
  },
  marketplace: {
    key: "marketplace",
    name: "Chợ dịch vụ & Đối tác địa phương",
    shortName: "Marketplace",
    icon: "storefront",
    description: "Quản trị nhà cung cấp dịch vụ, tour du lịch, LocalMate và danh mục liên kết nội khu",
    color: {
      bg: "bg-sky-50/70",
      text: "text-sky-900",
      border: "border-sky-200/80",
      badgeBg: "bg-sky-100/80 text-sky-800",
    },
  },
  "channel-manager": {
    key: "channel-manager",
    name: "Kênh phân phối trực tuyến (OTA)",
    shortName: "Kênh OTA",
    icon: "sync_alt",
    description: "Đồng bộ quỹ phòng ARI, biểu giá và kết nối đa kênh OTA qua Channex",
    color: {
      bg: "bg-indigo-50/70",
      text: "text-indigo-900",
      border: "border-indigo-200/80",
      badgeBg: "bg-indigo-100/80 text-indigo-800",
    },
  },
  guest: {
    key: "guest",
    name: "Trải nghiệm & Tương tác khách lưu trú",
    shortName: "Khách lưu trú",
    icon: "room_service",
    description: "Tiếp nhận và điều phối yêu cầu phòng, nhắn tin trực tuyến và trải nghiệm GuestOS",
    color: {
      bg: "bg-emerald-50/70",
      text: "text-emerald-900",
      border: "border-emerald-200/80",
      badgeBg: "bg-emerald-100/80 text-emerald-800",
    },
  },
  kbtt: {
    key: "kbtt",
    name: "Khai báo tạm trú (Bộ Công An)",
    shortName: "Khai báo tạm trú",
    icon: "fact_check",
    description: "Liên thông cổng dịch vụ công, lập hồ sơ và nộp báo cáo lưu trú tự động cho cơ quan chức năng",
    color: {
      bg: "bg-blue-50/70",
      text: "text-blue-900",
      border: "border-blue-200/80",
      badgeBg: "bg-blue-100/80 text-blue-800",
    },
  },
  system: {
    key: "system",
    name: "Hạ tầng & Vận hành hệ thống",
    shortName: "Hệ thống",
    icon: "dns",
    description: "Kiểm tra tình trạng sức khỏe dịch vụ, uptime và giám sát kết nối hạ tầng",
    color: {
      bg: "bg-slate-100/80",
      text: "text-slate-800",
      border: "border-slate-200/80",
      badgeBg: "bg-slate-200/80 text-slate-800",
    },
  },
};

export const IMMUTABLE_D3_PERMISSION_CATALOG: readonly D3CatalogPermission[] = [
  // ── Identity Bounded Context ──
  {
    key: "identity.permissions.read",
    label: "Xem danh mục quyền hệ thống",
    description: "Cho phép truy vấn catalog quyền hệ thống D3 và ma trận kiểm soát truy cập",
    bounded_context: "identity",
    risk: "LOW",
  },
  {
    key: "platform.users.view",
    label: "Xem danh sách người dùng",
    description: "Xem danh sách và thông tin tài khoản người dùng trên toàn nền tảng",
    bounded_context: "identity",
    risk: "LOW",
  },
  {
    key: "platform.users.manage",
    label: "Quản lý người dùng",
    description: "Thêm mới, cập nhật, khóa tài khoản và phân quyền cho người dùng",
    bounded_context: "identity",
    risk: "HIGH",
  },
  {
    key: "platform.roles.view",
    label: "Xem danh sách vai trò",
    description: "Xem cấu hình, danh sách vai trò và quyền hạn tương ứng trong hệ thống",
    bounded_context: "identity",
    risk: "LOW",
  },
  {
    key: "platform.roles.manage",
    label: "Quản lý vai trò",
    description: "Khởi tạo vai trò tùy chỉnh, cập nhật và gán tập quyền hạn cho vai trò",
    bounded_context: "identity",
    risk: "HIGH",
  },
  {
    key: "platform.permissions.manage",
    label: "Quản lý phân quyền hệ thống",
    description: "Cấu hình ma trận phân quyền nâng cao và chính sách kiểm soát truy cập",
    bounded_context: "identity",
    risk: "CRITICAL",
  },

  // ── Property Bounded Context ──
  {
    key: "platform.hotels.view",
    label: "Xem danh sách khách sạn",
    description: "Xem danh sách cơ sở lưu trú và chi nhánh khách sạn trên toàn nền tảng",
    bounded_context: "property",
    risk: "LOW",
  },
  {
    key: "platform.hotels.manage",
    label: "Quản lý khách sạn",
    description: "Khởi tạo, kích hoạt, cấu hình thuộc tính và quản trị cơ sở lưu trú",
    bounded_context: "property",
    risk: "HIGH",
  },
  {
    key: "platform.hotel-features.manage",
    label: "Quản lý tính năng mở khóa",
    description: "Cấu hình và bật/tắt các phân hệ tính năng cao cấp cho từng khách sạn",
    bounded_context: "property",
    risk: "HIGH",
  },
  {
    key: "hotel.profile.view",
    label: "Xem hồ sơ khách sạn",
    description: "Xem thông tin thương hiệu, địa chỉ, liên hệ và chính sách phục vụ của cơ sở",
    bounded_context: "property",
    risk: "LOW",
  },
  {
    key: "hotel.profile.manage",
    label: "Quản lý hồ sơ khách sạn",
    description: "Cập nhật thông tin kinh doanh, logo, chính sách nhận/trả phòng của cơ sở",
    bounded_context: "property",
    risk: "HIGH",
  },
  {
    key: "hotel.dashboard.view",
    label: "Xem tổng quan khách sạn",
    description: "Truy cập bảng điều khiển vận hành buồng phòng và các chỉ số kinh doanh",
    bounded_context: "property",
    risk: "LOW",
  },
  {
    key: "hotel.rooms.view",
    label: "Xem danh sách phòng",
    description: "Xem sơ đồ buồng phòng, hạng phòng và tình trạng phòng trống hiện thời",
    bounded_context: "property",
    risk: "LOW",
  },
  {
    key: "hotel.rooms.manage",
    label: "Quản lý phòng",
    description: "Thêm, chỉnh sửa thông tin số phòng, loại phòng và tiện nghi buồng phòng",
    bounded_context: "property",
    risk: "HIGH",
  },
  {
    key: "hotel.rooms.status.manage",
    label: "Quản lý trạng thái buồng phòng",
    description: "Cập nhật trạng thái buồng phòng: sạch, bẩn, đang dọn, kiểm tra hoặc bảo trì",
    bounded_context: "property",
    risk: "HIGH",
  },
  {
    key: "hotel.rooms.ready.confirm",
    label: "Xác nhận phòng sẵn sàng đón khách",
    description: "Nghiệm thu buồng phòng sau vệ sinh và xác nhận phòng sẵn sàng để check-in",
    bounded_context: "property",
    risk: "MEDIUM",
  },
  {
    key: "hotel.rooms.qr.manage",
    label: "Quản lý mã QR phòng",
    description: "Tạo mới, in ấn và làm mới mã QR kích hoạt cổng GuestOS cho từng phòng",
    bounded_context: "property",
    risk: "HIGH",
  },
  {
    key: "hotel.stays.view",
    label: "Xem danh sách khách lưu trú",
    description: "Theo dõi danh sách khách hàng đang trong kỳ lưu trú tại cơ sở",
    bounded_context: "property",
    risk: "LOW",
  },
  {
    key: "hotel.stays.manage",
    label: "Quản lý khách lưu trú",
    description: "Cập nhật thông tin khách lưu trú, gia hạn phòng và điều chỉnh thời gian ở",
    bounded_context: "property",
    risk: "HIGH",
  },
  {
    key: "hotel.stays.check-in",
    label: "Thực hiện check-in nhận phòng",
    description: "Xử lý thủ tục nhận phòng, quét giấy tờ tùy thân và kích hoạt quyền phòng",
    bounded_context: "property",
    risk: "HIGH",
  },
  {
    key: "hotel.stays.check-out",
    label: "Thực hiện check-out trả phòng",
    description: "Xử lý thủ tục trả phòng, đóng phiên lưu trú và chuyển trạng thái phòng sang bẩn",
    bounded_context: "property",
    risk: "HIGH",
  },
  {
    key: "hotel.reservations.view",
    label: "Xem danh sách đặt phòng",
    description: "Xem lịch đặt phòng, thông tin khách đặt trước và kênh đặt phòng",
    bounded_context: "property",
    risk: "LOW",
  },
  {
    key: "hotel.reservations.manage",
    label: "Quản lý đặt phòng",
    description: "Tạo đặt phòng mới, điều chỉnh lịch, hủy đặt phòng và gán buồng phòng",
    bounded_context: "property",
    risk: "HIGH",
  },
  {
    key: "hotel.staff.view",
    label: "Xem nhân viên & phân công",
    description: "Xem danh sách nhân sự cơ sở, lịch trực và phân công khu vực quản lý",
    bounded_context: "property",
    risk: "LOW",
  },
  {
    key: "hotel.staff.manage",
    label: "Quản lý nhân viên",
    description: "Thêm nhân viên cơ sở, gán vai trò vận hành và thiết lập quyền truy cập",
    bounded_context: "property",
    risk: "HIGH",
  },

  // ── Billing Bounded Context ──
  {
    key: "platform.billing.view",
    label: "Xem thanh toán nền tảng",
    description: "Theo dõi dòng tiền, hóa đơn đối tác và giao dịch toàn hệ thống",
    bounded_context: "billing",
    risk: "LOW",
  },
  {
    key: "platform.billing.manage",
    label: "Quản lý thanh toán nền tảng",
    description: "Cấu hình cổng thanh toán, thiết lập tỷ lệ hoa hồng và đối soát tài chính",
    bounded_context: "billing",
    risk: "CRITICAL",
  },
  {
    key: "hotel.billing.view",
    label: "Xem danh sách thanh toán cơ sở",
    description: "Theo dõi hóa đơn tiền phòng, phụ phí dịch vụ và nhật ký thu chi cơ sở",
    bounded_context: "billing",
    risk: "LOW",
  },
  {
    key: "hotel.billing.manage",
    label: "Quản lý thanh toán cơ sở",
    description: "Lập phiếu thu, điều chỉnh biểu phí phòng và xử lý hoàn tiền phát sinh",
    bounded_context: "billing",
    risk: "CRITICAL",
  },
  {
    key: "hotel.billing.checkout",
    label: "Quyết toán thanh toán trả phòng",
    description: "Quyết toán folio, xác nhận thanh toán cuối cùng và in biên lai trả phòng",
    bounded_context: "billing",
    risk: "CRITICAL",
  },
  {
    key: "hotel.revenue-protection.view",
    label: "Xem bảo vệ doanh thu",
    description: "Theo dõi báo cáo kiểm toán rủi ro và các cảnh báo thất thoát tài chính",
    bounded_context: "billing",
    risk: "MEDIUM",
  },

  // ── Marketplace Bounded Context ──
  {
    key: "platform.marketplace.view",
    label: "Xem Marketplace nền tảng",
    description: "Xem danh mục sản phẩm, dịch vụ và mạng lưới nhà cung cấp liên kết",
    bounded_context: "marketplace",
    risk: "LOW",
  },
  {
    key: "platform.marketplace.manage",
    label: "Quản lý Marketplace nền tảng",
    description: "Phê duyệt nhà cung cấp, kiểm duyệt danh mục dịch vụ và hoa hồng kết nối",
    bounded_context: "marketplace",
    risk: "HIGH",
  },
  {
    key: "platform.localmate.view",
    label: "Xem hồ sơ LocalMate",
    description: "Tra cứu danh sách hướng dẫn viên, chuyên gia và trải nghiệm bản địa",
    bounded_context: "marketplace",
    risk: "LOW",
  },
  {
    key: "platform.localmate.manage",
    label: "Quản lý LocalMate",
    description: "Kiểm duyệt hồ sơ hướng dẫn viên bản địa và quản lý kho tri thức trải nghiệm",
    bounded_context: "marketplace",
    risk: "HIGH",
  },
  {
    key: "service.marketplace.view",
    label: "Xem Marketplace nhà cung cấp",
    description: "Theo dõi đơn đặt hàng dịch vụ và năng lực cung ứng của nhà cung cấp",
    bounded_context: "marketplace",
    risk: "LOW",
  },
  {
    key: "service.marketplace.manage",
    label: "Quản lý Marketplace nhà cung cấp",
    description: "Cập nhật bảng giá dịch vụ, số lượng phục vụ và điều kiện nhận đơn hàng",
    bounded_context: "marketplace",
    risk: "HIGH",
  },
  {
    key: "hotel.marketplace.view",
    label: "Xem Marketplace khách sạn",
    description: "Xem danh mục dịch vụ đối tác liên kết đang phục vụ khách của cơ sở",
    bounded_context: "marketplace",
    risk: "LOW",
  },
  {
    key: "hotel.marketplace.revenue.view",
    label: "Xem doanh thu Marketplace",
    description: "Xem báo cáo doanh thu bán chéo và hoa hồng nhận được từ dịch vụ liên kết",
    bounded_context: "marketplace",
    risk: "LOW",
  },
  {
    key: "hotel.services.view",
    label: "Xem danh mục & dịch vụ cơ sở",
    description: "Xem thực đơn nhà hàng, dịch vụ spa, giặt là và các tiện ích nội bộ cơ sở",
    bounded_context: "marketplace",
    risk: "LOW",
  },
  {
    key: "hotel.services.manage",
    label: "Quản lý danh mục & dịch vụ cơ sở",
    description: "Tạo, cập nhật bảng giá và kích hoạt dịch vụ tiện ích phục vụ khách lưu trú",
    bounded_context: "marketplace",
    risk: "HIGH",
  },
  {
    key: "hotel.local-partners.view",
    label: "Xem đối tác địa phương",
    description: "Xem mạng lưới đối tác du lịch, ẩm thực và xe đưa đón quanh khu vực",
    bounded_context: "marketplace",
    risk: "LOW",
  },
  {
    key: "hotel.local-partners.manage",
    label: "Quản lý đối tác địa phương",
    description: "Thiết lập liên kết hợp tác, hoa hồng và điều phối dịch vụ đối tác địa phương",
    bounded_context: "marketplace",
    risk: "HIGH",
  },

  // ── Channel Manager Bounded Context ──
  {
    key: "hotel.channels.view",
    label: "Xem kết nối kênh phân phối",
    description: "Xem cấu hình đồng bộ ARI và trạng thái kết nối với các kênh OTA đối tác",
    bounded_context: "channel-manager",
    risk: "LOW",
  },
  {
    key: "hotel.channels.manage",
    label: "Quản lý kết nối kênh phân phối",
    description: "Cấu hình tài khoản Channex, đồng bộ phòng trống và quy tắc hạn chế đặt phòng",
    bounded_context: "channel-manager",
    risk: "HIGH",
  },

  // ── Guest Experience Bounded Context ──
  {
    key: "hotel.requests.view",
    label: "Xem danh sách yêu cầu khách",
    description: "Theo dõi các yêu cầu tiện ích phòng, gọi đồ và hỗ trợ gửi từ GuestOS",
    bounded_context: "guest",
    risk: "LOW",
  },
  {
    key: "hotel.requests.manage",
    label: "Quản lý yêu cầu khách",
    description: "Tiếp nhận, phản hồi, thay đổi trạng thái và hủy yêu cầu của khách",
    bounded_context: "guest",
    risk: "HIGH",
  },
  {
    key: "hotel.requests.coordinate",
    label: "Điều phối yêu cầu khách",
    description: "Phân công nhân sự buồng phòng, kỹ thuật hoặc phục vụ thực hiện yêu cầu",
    bounded_context: "guest",
    risk: "HIGH",
  },
  {
    key: "hotel.requests.execute",
    label: "Thực thi yêu cầu khách",
    description: "Tiến hành xử lý trực tiếp tại phòng và đánh dấu hoàn thành yêu cầu",
    bounded_context: "guest",
    risk: "HIGH",
  },
  {
    key: "hotel.messages.view",
    label: "Xem tin nhắn phòng",
    description: "Đọc tin nhắn và các yêu cầu trao đổi trực tuyến giữa khách và lễ tân",
    bounded_context: "guest",
    risk: "LOW",
  },
  {
    key: "hotel.messages.manage",
    label: "Quản lý tin nhắn phòng",
    description: "Gửi tin nhắn phản hồi cho khách, gửi hướng dẫn và hỗ trợ tương tác",
    bounded_context: "guest",
    risk: "HIGH",
  },
  {
    key: "hotel.notifications.view",
    label: "Xem cấu hình thông báo",
    description: "Xem các mẫu thông báo đẩy, SMS chào mừng và thông báo hệ thống cơ sở",
    bounded_context: "guest",
    risk: "LOW",
  },
  {
    key: "hotel.notifications.manage",
    label: "Quản lý cấu hình thông báo",
    description: "Thiết lập kịch bản gửi tin tự động và tùy biến thông báo cho khách hàng",
    bounded_context: "guest",
    risk: "HIGH",
  },
  {
    key: "guest.experience.use",
    label: "Sử dụng cổng GuestOS",
    description: "Truy cập giao diện số dành riêng cho khách để gọi dịch vụ và điều khiển phòng",
    bounded_context: "guest",
    risk: "MEDIUM",
  },

  // ── KBTT Compliance Bounded Context ──
  {
    key: "hotel.kbtt.view",
    label: "Xem kết nối khai báo tạm trú",
    description: "Xem trạng thái liên thông với hệ thống khai báo lưu trú của cơ quan chức năng",
    bounded_context: "kbtt",
    risk: "LOW",
  },
  {
    key: "hotel.kbtt.manage",
    label: "Quản lý kết nối khai báo tạm trú",
    description: "Cấu hình tài khoản, máy trạm quét CCCD và chứng thư số khai báo lưu trú",
    bounded_context: "kbtt",
    risk: "HIGH",
  },
  {
    key: "hotel.kbtt.declarations.view",
    label: "Xem danh sách hồ sơ tạm trú",
    description: "Xem lịch sử nộp hồ sơ, danh sách tờ khai lưu trú và kết quả tiếp nhận",
    bounded_context: "kbtt",
    risk: "LOW",
  },
  {
    key: "hotel.kbtt.declarations.manage",
    label: "Quản lý hồ sơ khai báo tạm trú",
    description: "Lập hồ sơ khai báo mới, chỉnh sửa thông tin nhân thân và gửi báo cáo lưu trú",
    bounded_context: "kbtt",
    risk: "HIGH",
  },

  // ── System Health Bounded Context ──
  {
    key: "system.health.view",
    label: "Xem trạng thái hệ thống",
    description: "Theo dõi trạng thái máy chủ, uptime, độ trễ và tính sẵn sàng của hệ thống",
    bounded_context: "system",
    risk: "LOW",
  },
];

export const RISK_LEVEL_CONFIG: Record<
  BusinessPermissionRisk,
  {
    label: string;
    description: string;
    badgeBg: string;
    dotBg: string;
  }
> = {
  LOW: {
    label: "Thấp (Read-only)",
    description: "Chỉ đọc và tra cứu dữ liệu, không ảnh hưởng trạng thái vận hành",
    badgeBg: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
    dotBg: "bg-emerald-500",
  },
  MEDIUM: {
    label: "Trung bình",
    description: "Thao tác xác nhận hoặc tương tác người dùng có phạm vi cục bộ",
    badgeBg: "bg-blue-50 text-blue-800 border-blue-200/80",
    dotBg: "bg-blue-500",
  },
  HIGH: {
    label: "Cao (Ghi / Vận hành)",
    description: "Thay đổi dữ liệu vận hành, phân công hoặc cập nhật cấu hình dịch vụ",
    badgeBg: "bg-amber-50 text-amber-900 border-amber-200/80",
    dotBg: "bg-amber-500",
  },
  CRITICAL: {
    label: "Trọng yếu (Tài chính / Hệ thống)",
    description: "Quyết toán tiền bạc, xóa dữ liệu hoặc cấu hình phân quyền nhạy cảm",
    badgeBg: "bg-rose-50 text-rose-800 border-rose-200/80",
    dotBg: "bg-rose-500",
  },
};

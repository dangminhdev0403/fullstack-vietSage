export type ServiceCategory = {
  id: string;
  title: string;
  description: string;
  accent: "primary" | "secondary" | "error" | "neutral";
};

export type RequestStatus =
  | "Chờ duyệt"
  | "Đã nhận"
  | "Đang xử lý"
  | "Hoàn thành"
  | "Đã hủy";

export type RequestPriority = "CA KHẨN" | "Ưu tiên" | "Thường";

export type ServiceRequest = {
  room: string;
  service: string;
  time: string;
  note: string;
  priority: RequestPriority;
  status: RequestStatus;
};

export const guestServices: ServiceCategory[] = [
  {
    id: "cleaning",
    title: "Dọn phòng",
    description: "Yêu cầu vệ sinh và làm mới không gian phòng.",
    accent: "primary",
  },
  {
    id: "supplies",
    title: "Yêu cầu vật dụng",
    description: "Giấy vệ sinh, khăn tắm, bàn chải hoặc xà phòng.",
    accent: "secondary",
  },
  {
    id: "water",
    title: "Nước uống",
    description: "Bổ sung nước suối đóng chai hoặc đá viên.",
    accent: "primary",
  },
  {
    id: "reception",
    title: "Gọi lễ tân",
    description: "Kết nối trực tiếp với bộ phận tiền sảnh 24/7.",
    accent: "secondary",
  },
  {
    id: "incident",
    title: "Báo cáo sự cố",
    description: "Hỏng hóc thiết bị, điện nước hoặc internet.",
    accent: "error",
  },
  {
    id: "other",
    title: "Yêu cầu khác",
    description: "Gửi lời nhắn hoặc yêu cầu đặc biệt khác.",
    accent: "neutral",
  },
];

export const guestTrackingHistory = [
  {
    id: "food-01",
    title: "Dịch vụ ăn uống tại phòng",
    summary: "Phở Bò truyền thống & Nước cam ép",
    time: "Hôm qua, 19:30",
    status: "Hoàn thành" as const,
  },
  {
    id: "laundry-01",
    title: "Giặt là cao cấp",
    summary: "2 Áo sơ mi & 1 Vest (Giặt khô)",
    time: "15 Thg 10, 09:00",
    status: "Hoàn thành" as const,
  },
];

export const staffNewRequests: ServiceRequest[] = [
  {
    room: "402",
    service: "Ẩm thực tại phòng",
    time: "10:15",
    note: "Không hành, thêm chanh",
    priority: "CA KHẨN",
    status: "Chờ duyệt",
  },
  {
    room: "105",
    service: "Dọn phòng",
    time: "10:08",
    note: "Dọn trước 11:00",
    priority: "Thường",
    status: "Đang xử lý",
  },
  {
    room: "212",
    service: "Vận chuyển hành lý",
    time: "09:57",
    note: "Hỗ trợ chuyển xuống sảnh",
    priority: "Ưu tiên",
    status: "Chờ duyệt",
  },
  {
    room: "501",
    service: "Đặt lịch Spa",
    time: "09:42",
    note: "Liệu trình 60 phút",
    priority: "Ưu tiên",
    status: "Chờ duyệt",
  },
];

export const adminRecentRequests = [
  {
    id: "recent-1",
    title: "Dịch vụ ăn uống tại phòng",
    subtitle: "Phòng 402 • 10 phút trước",
    status: "Đang xử lý" as const,
  },
  {
    id: "recent-2",
    title: "Yêu cầu dọn dẹp",
    subtitle: "Phòng 215 • 25 phút trước",
    status: "Đã nhận" as const,
  },
  {
    id: "recent-3",
    title: "Sửa chữa máy điều hòa",
    subtitle: "Phòng 108 • 45 phút trước",
    status: "Chờ duyệt" as const,
  },
];

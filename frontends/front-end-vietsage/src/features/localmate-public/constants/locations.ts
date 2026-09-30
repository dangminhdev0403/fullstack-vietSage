export type DestinationRegion = "all" | "bac" | "trung" | "tay_nguyen" | "nam";

export interface DestinationSuggestion {
  name: string;
  region: "bac" | "trung" | "tay_nguyen" | "nam";
  tag?: string;
  icon?: string;
  popular?: boolean;
}

export const REGION_TABS: { id: DestinationRegion; label: string }[] = [
  { id: "all", label: "🔥 Nổi bật" },
  { id: "bac", label: "Miền Bắc" },
  { id: "trung", label: "Miền Trung" },
  { id: "tay_nguyen", label: "Tây Nguyên" },
  { id: "nam", label: "Miền Nam" },
];

export const POPULAR_DESTINATIONS: DestinationSuggestion[] = [
  // --- Nổi bật ---
  { name: "Hà Nội", region: "bac", icon: "🏛️", tag: "Thủ đô di sản", popular: true },
  { name: "Đà Nẵng", region: "trung", icon: "🌉", tag: "Thành phố biển", popular: true },
  { name: "TP. Hồ Chí Minh", region: "nam", icon: "🏙️", tag: "Trung tâm sôi động", popular: true },
  { name: "Hội An", region: "trung", icon: "🏮", tag: "Phố cổ di sản", popular: true },
  { name: "Đà Lạt", region: "tay_nguyen", icon: "🌸", tag: "Thành phố sương mù", popular: true },
  { name: "Nha Trang", region: "trung", icon: "🏖️", tag: "Vịnh biển đẹp", popular: true },
  { name: "Phú Quốc", region: "nam", icon: "🏝️", tag: "Đảo ngọc nghỉ dưỡng", popular: true },
  { name: "Hạ Long", region: "bac", icon: "⛵", tag: "Kỳ quan vịnh biển", popular: true },
  { name: "Ninh Bình", region: "bac", icon: "⛰️", tag: "Tràng An di sản", popular: true },
  { name: "Huế", region: "trung", icon: "👑", tag: "Cố đô di sản", popular: true },
  { name: "Sa Pa", region: "bac", icon: "🏔️", tag: "Săn mây Tây Bắc", popular: true },
  { name: "Vũng Tàu", region: "nam", icon: "🌊", tag: "Biển gần Sài Gòn", popular: true },

  // --- Miền Bắc mở rộng ---
  { name: "Hà Giang", region: "bac", icon: "🌄", tag: "Cao nguyên đá", popular: false },
  { name: "Cao Bằng", region: "bac", icon: "💧", tag: "Thác Bản Giốc", popular: false },
  { name: "Mộc Châu", region: "bac", icon: "🍃", tag: "Đồi chè thảo nguyên", popular: false },
  { name: "Hải Phòng", region: "bac", icon: "⚓", tag: "Cát Bà & Đồ Sơn", popular: false },

  // --- Miền Trung mở rộng ---
  { name: "Quy Nhơn", region: "trung", icon: "🏖️", tag: "Eo Gió Kỳ Co", popular: false },
  { name: "Phú Yên", region: "trung", icon: "🌾", tag: "Hoa vàng cỏ xanh", popular: false },
  { name: "Quảng Bình", region: "trung", icon: "🪨", tag: "Vương quốc hang động", popular: false },

  // --- Tây Nguyên mở rộng ---
  { name: "Buôn Ma Thuột", region: "tay_nguyen", icon: "☕", tag: "Thủ phủ cà phê", popular: false },
  { name: "Pleiku", region: "tay_nguyen", icon: "🌲", tag: "Biển Hồ T'Nưng", popular: false },

  // --- Miền Nam mở rộng ---
  { name: "Cần Thơ", region: "nam", icon: "🛶", tag: "Chợ nổi Cái Răng", popular: false },
  { name: "Phan Thiết", region: "nam", icon: "☀️", tag: "Mũi Né đồi cát", popular: false },
  { name: "Côn Đảo", region: "nam", icon: "🐢", tag: "Biển đảo hoang sơ", popular: false },
  { name: "Tây Ninh", region: "nam", icon: "⛰️", tag: "Núi Bà Đen", popular: false },
];

export const VIETNAM_PROVINCES: string[] = [
  "An Giang",
  "Bà Rịa - Vũng Tàu",
  "Bắc Giang",
  "Bắc Kạn",
  "Bạc Liêu",
  "Bắc Ninh",
  "Bến Tre",
  "Bình Định",
  "Bình Dương",
  "Bình Phước",
  "Bình Thuận",
  "Cà Mau",
  "Cần Thơ",
  "Cao Bằng",
  "Đà Nẵng",
  "Đắk Lắk",
  "Đắk Nông",
  "Điện Biên",
  "Đồng Nai",
  "Đồng Tháp",
  "Gia Lai",
  "Hà Giang",
  "Hà Nam",
  "Hà Nội",
  "Hà Tĩnh",
  "Hải Dương",
  "Hải Phòng",
  "Hậu Giang",
  "Hòa Bình",
  "Hưng Yên",
  "Khánh Hòa",
  "Kiên Giang",
  "Kon Tum",
  "Lai Châu",
  "Lâm Đồng",
  "Lạng Sơn",
  "Lào Cai",
  "Long An",
  "Nam Định",
  "Nghệ An",
  "Ninh Bình",
  "Ninh Thuận",
  "Phú Thọ",
  "Phú Yên",
  "Quảng Bình",
  "Quảng Nam",
  "Quảng Ngãi",
  "Quảng Ninh",
  "Quảng Trị",
  "Sóc Trăng",
  "Sơn La",
  "Tây Ninh",
  "Thái Bình",
  "Thái Nguyên",
  "Thanh Hóa",
  "Thừa Thiên Huế",
  "Tiền Giang",
  "TP. Hồ Chí Minh",
  "Trà Vinh",
  "Tuyên Quang",
  "Vĩnh Long",
  "Vĩnh Phúc",
  "Yên Bái",
];

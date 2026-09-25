import type { LocalMateTourScope } from "../types";

export type RegionCode = "BAC" | "TRUNG" | "TAY_NGUYEN" | "NAM";

export interface RegionTaxonomy {
  code: RegionCode;
  name: string;
  shortName: string;
  iconName: string;
  description: string;
}

export interface ProvinceTaxonomy {
  code: string;
  name: string;
  regionCode: RegionCode;
  destinations: string[];
}

export interface TourScopeDefinition {
  value: LocalMateTourScope;
  label: string;
  shortLabel: string;
  badgeClass: string;
  description: string;
}

export const REGIONS: RegionTaxonomy[] = [
  {
    code: "BAC",
    name: "Miền Bắc",
    shortName: "Bắc Bộ",
    iconName: "landscape",
    description: "Tây Bắc, Đông Bắc & Đồng bằng Sông Hồng",
  },
  {
    code: "TRUNG",
    name: "Miền Trung",
    shortName: "Trung Bộ",
    iconName: "waves",
    description: "Bắc Trung Bộ & Duyên hải Nam Trung Bộ",
  },
  {
    code: "TAY_NGUYEN",
    name: "Tây Nguyên",
    shortName: "Cao Nguyên",
    iconName: "forest",
    description: "Đà Lạt, Đắk Lắk, Gia Lai & Cao nguyên",
  },
  {
    code: "NAM",
    name: "Miền Nam",
    shortName: "Nam Bộ",
    iconName: "apartment",
    description: "Đông Nam Bộ & Đồng bằng Sông Cửu Long",
  },
];

export const PROVINCES: ProvinceTaxonomy[] = [
  // --- Miền Bắc ---
  {
    code: "HA_NOI",
    name: "Hà Nội",
    regionCode: "BAC",
    destinations: ["Phố Cổ & Hoàn Kiếm", "Ba Đình", "Tây Hồ", "Ba Vì", "Đường Lâm", "Sóc Sơn"],
  },
  {
    code: "LAO_CAI",
    name: "Lào Cai",
    regionCode: "BAC",
    destinations: ["Sa Pa", "Bắc Hà", "Bát Xát", "Y Tý"],
  },
  {
    code: "YEN_BAI",
    name: "Yên Bái",
    regionCode: "BAC",
    destinations: [
      "Mù Cang Chải",
      "Nghĩa Lộ",
      "Hồ Thác Bà",
      "Trạm Tấu",
      "Suối Giàng",
      "Tú Lệ",
      "Văn Chấn",
    ],
  },
  {
    code: "HA_GIANG",
    name: "Hà Giang",
    regionCode: "BAC",
    destinations: ["Đồng Văn", "Mèo Vạc", "Lũng Cú", "Hoàng Su Phì", "Mã Pí Lèng"],
  },
  {
    code: "CAO_BANG",
    name: "Cao Bằng",
    regionCode: "BAC",
    destinations: ["Thác Bản Giốc", "Pác Bó", "Hồ Thang Hen"],
  },
  {
    code: "SON_LA",
    name: "Sơn La",
    regionCode: "BAC",
    destinations: ["Mộc Châu", "Tà Xùa", "Bắc Yên"],
  },
  {
    code: "NINH_BINH",
    name: "Ninh Bình",
    regionCode: "BAC",
    destinations: ["Tràng An", "Tam Cốc", "Bái Đính", "Hang Múa"],
  },
  {
    code: "QUANG_NINH",
    name: "Quảng Ninh",
    regionCode: "BAC",
    destinations: ["Vịnh Hạ Long", "Cô Tô", "Vân Đồn", "Yên Tử"],
  },

  // --- Miền Trung ---
  {
    code: "DA_NANG",
    name: "Đà Nẵng",
    regionCode: "TRUNG",
    destinations: ["Biển Mỹ Khê & Sơn Trà", "Bà Nà Hills", "Ngũ Hành Sơn", "Sông Hàn"],
  },
  {
    code: "QUANG_NAM",
    name: "Quảng Nam",
    regionCode: "TRUNG",
    destinations: ["Hội An", "Cù Lao Chàm", "Mỹ Sơn", "Rừng dừa Bảy Mẫu"],
  },
  {
    code: "THUA_THIEN_HUE",
    name: "Thừa Thiên Huế",
    regionCode: "TRUNG",
    destinations: ["Đại Nội Huế", "Lăng Tự Đức", "Sông Hương", "Đầm Lập An"],
  },
  {
    code: "KHANH_HOA",
    name: "Khánh Hòa",
    regionCode: "TRUNG",
    destinations: ["Nha Trang", "Vịnh Cam Ranh", "Đảo Bình Ba", "Hòn Tằm"],
  },
  {
    code: "BINH_DINH",
    name: "Bình Định",
    regionCode: "TRUNG",
    destinations: ["Quy Nhơn", "Kỳ Co", "Eo Gió", "Ghềnh Ráng"],
  },

  // --- Tây Nguyên ---
  {
    code: "LAM_DONG",
    name: "Lâm Đồng",
    regionCode: "TAY_NGUYEN",
    destinations: ["Đà Lạt", "Hồ Tuyền Lâm", "Langbiang", "Bảo Lộc", "Thung lũng Vàng"],
  },
  {
    code: "DAK_LAK",
    name: "Đắk Lắk",
    regionCode: "TAY_NGUYEN",
    destinations: ["Buôn Ma Thuột", "Hồ Lắk", "Buôn Đôn", "Thác Dray Nur"],
  },
  {
    code: "GIA_LAI",
    name: "Gia Lai",
    regionCode: "TAY_NGUYEN",
    destinations: ["Pleiku", "Biển Hồ T'Nưng", "Chư Đang Ya", "Thác Phú Cường"],
  },

  // --- Miền Nam ---
  {
    code: "HO_CHI_MINH",
    name: "TP. Hồ Chí Minh",
    regionCode: "NAM",
    destinations: ["Quận 1 & Trung tâm di sản", "Củ Chi", "Cần Giờ", "Bến Bạch Đằng"],
  },
  {
    code: "KIEN_GIANG",
    name: "Kiên Giang",
    regionCode: "NAM",
    destinations: ["Phú Quốc", "Nam Du", "Rạch Giá", "Hà Tiên"],
  },
  {
    code: "BA_RIA_VUNG_TAU",
    name: "Bà Rịa - Vũng Tàu",
    regionCode: "NAM",
    destinations: ["Vũng Tàu", "Côn Đảo", "Hồ Tràm", "Long Hải"],
  },
  {
    code: "CAN_THO",
    name: "Cần Thơ",
    regionCode: "NAM",
    destinations: ["Bến Ninh Kiều", "Chợ nổi Cái Răng", "Cồn Sơn"],
  },
];

export const TOUR_SCOPES: TourScopeDefinition[] = [
  {
    value: "LOCAL",
    label: "Nội vùng KS (< 15km)",
    shortLabel: "Nội vùng (<15km)",
    badgeClass: "bg-[#173F35]/10 text-[#173F35] border-[#25483F]/20",
    description: "Khám phá gần cơ sở lưu trú, bán kính dưới 15km",
  },
  {
    value: "REGIONAL_DAYTRIP",
    label: "Trong ngày (15-60km)",
    shortLabel: "Trong ngày (15-60km)",
    badgeClass: "bg-[#B18B26]/12 text-[#8A6A13] border-[#B18B26]/25",
    description: "Tuyến trải nghiệm bán kính 15-60km, đi về trong ngày",
  },
  {
    value: "INTERPROVINCIAL",
    label: "Tuyến liên tỉnh",
    shortLabel: "Tuyến liên tỉnh",
    badgeClass: "bg-[#2563EB]/10 text-[#1D4ED8] border-[#2563EB]/25",
    description: "Hành trình dài di chuyển xuyên tỉnh hoặc khoảng cách lớn hơn 60km",
  },
];

export const REGION_MAP: Record<RegionCode, RegionTaxonomy> = Object.fromEntries(
  REGIONS.map((r) => [r.code, r]),
) as Record<RegionCode, RegionTaxonomy>;

export const TOUR_SCOPE_MAP: Record<LocalMateTourScope, TourScopeDefinition> = {
  LOCAL: TOUR_SCOPES[0],
  REGIONAL_DAYTRIP: TOUR_SCOPES[1],
  INTERPROVINCIAL: TOUR_SCOPES[2],
};

export const PROVINCE_MAP: Record<string, ProvinceTaxonomy> = Object.fromEntries(
  PROVINCES.map((p) => [p.code, p]),
);

/**
 * Lấy danh sách các tỉnh theo mã khu vực (4 khu vực chính)
 */
export function getProvincesByRegion(regionCode: RegionCode): ProvinceTaxonomy[] {
  return PROVINCES.filter((p) => p.regionCode === regionCode);
}

/**
 * Suy luận Tỉnh/Thành phố từ chuỗi Điểm đến (destination) hoặc Tiêu đề (title) nếu bản ghi cũ chưa lưu provinceCode
 */
export function detectProvinceFromDestination(
  destination?: string,
  title?: string,
): ProvinceTaxonomy | undefined {
  if (!destination && !title) return undefined;
  const dNorm = (destination || "").toLowerCase().trim();
  const tNorm = (title || "").toLowerCase().trim();

  // Check destination first
  if (dNorm) {
    for (const prov of PROVINCES) {
      if (dNorm.includes(prov.name.toLowerCase())) {
        return prov;
      }
      for (const dest of prov.destinations) {
        if (dNorm.includes(dest.toLowerCase())) {
          return prov;
        }
      }
    }
  }

  // Fallback check title
  if (tNorm) {
    for (const prov of PROVINCES) {
      if (tNorm.includes(prov.name.toLowerCase())) {
        return prov;
      }
      for (const dest of prov.destinations) {
        if (tNorm.includes(dest.toLowerCase())) {
          return prov;
        }
      }
    }
  }

  return undefined;
}

export const COMMON_TOUR_DURATIONS = [
  "Nửa Ngày",
  "1 Ngày",
  "2 Ngày 1 Đêm",
  "3 Ngày 2 Đêm",
  "4 Ngày 3 Đêm",
  "5 Ngày 4 Đêm",
] as const;

/**
 * Chuẩn hoá chuỗi thời lượng tour về format rõ ràng và chuẩn mực (ví dụ: "2N1Đ" -> "2 Ngày 1 Đêm")
 */
export function normalizeTourDuration(raw?: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();

  // Pattern like: 0,5N or 0.5N or 0,5 ngày or nửa ngày
  if (/^0[.,]5\s*(n|ng[aà]y)?$/i.test(trimmed) || /^n[uử]a\s*ng[aà]y$/i.test(trimmed)) {
    return "Nửa Ngày";
  }

  // Pattern like: 2N1Đ, 2N1D, 2n1d, 3N2Đ
  const ndMatch = trimmed.match(/^(\d+)\s*[nN]\s*(\d+)\s*[đĐdD]$/i);
  if (ndMatch) {
    const days = ndMatch[1];
    const nights = ndMatch[2];
    return `${days} Ngày ${nights} Đêm`;
  }

  // Pattern like: 1N, 2N, 3N (without night specified)
  const nOnlyMatch = trimmed.match(/^(\d+)\s*[nN]$/i);
  if (nOnlyMatch) {
    const days = nOnlyMatch[1];
    return `${days} Ngày`;
  }

  // Pattern like "2 ngày 1 đêm", "2 ngay 1 dem"
  const textNdMatch = trimmed.match(/^(\d+)\s*ng[aà]y\s*(\d+)\s*[đd][eê]m$/i);
  if (textNdMatch) {
    return `${textNdMatch[1]} Ngày ${textNdMatch[2]} Đêm`;
  }

  // Pattern like "1 ngày", "2 ngày"
  const textNMatch = trimmed.match(/^(\d+)\s*ng[aà]y$/i);
  if (textNMatch) {
    return `${textNMatch[1]} Ngày`;
  }

  return trimmed;
}

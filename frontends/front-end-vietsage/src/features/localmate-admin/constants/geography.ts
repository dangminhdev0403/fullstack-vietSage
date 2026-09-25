import type { LocalMateTourScope } from "../types";

export interface ProvinceTaxonomy {
  code: string;
  name: string;
  destinations: string[];
}

export interface TourScopeDefinition {
  value: LocalMateTourScope;
  label: string;
  shortLabel: string;
  badgeClass: string;
  description: string;
}

export const PROVINCES: ProvinceTaxonomy[] = [
  {
    code: "LAO_CAI",
    name: "Lào Cai",
    destinations: ["Sa Pa", "Bắc Hà", "Bát Xát", "Y Tý"],
  },
  {
    code: "YEN_BAI",
    name: "Yên Bái",
    destinations: [
      "Mù Cang Chải",
      "Nghĩa Lộ",
      "Hồ Thác Bà",
      "Trạm Tấu",
      "Suối Giàng",
      "Tú Lệ",
    ],
  },
  {
    code: "HA_NOI",
    name: "Hà Nội",
    destinations: ["Phố Cổ & Hoàn Kiếm", "Ba Vì", "Đường Lâm", "Sóc Sơn"],
  },
  {
    code: "DA_NANG",
    name: "Đà Nẵng",
    destinations: ["Biển Mỹ Khê & Sơn Trà", "Bà Nà Hills", "Ngũ Hành Sơn"],
  },
  {
    code: "QUANG_NAM",
    name: "Quảng Nam",
    destinations: ["Hội An", "Cù Lao Chàm", "Mỹ Sơn"],
  },
  {
    code: "HO_CHI_MINH",
    name: "TP. Hồ Chí Minh",
    destinations: ["Quận 1 & Trung tâm di sản", "Củ Chi", "Cần Giờ"],
  },
  {
    code: "KIEN_GIANG",
    name: "Kiên Giang",
    destinations: ["Phú Quốc", "Nam Du", "Rạch Giá"],
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

export const TOUR_SCOPE_MAP: Record<LocalMateTourScope, TourScopeDefinition> = {
  LOCAL: TOUR_SCOPES[0],
  REGIONAL_DAYTRIP: TOUR_SCOPES[1],
  INTERPROVINCIAL: TOUR_SCOPES[2],
};

export const PROVINCE_MAP: Record<string, ProvinceTaxonomy> = Object.fromEntries(
  PROVINCES.map((p) => [p.code, p]),
);

/**
 * Suy luận Tỉnh/Thành phố từ chuỗi Điểm đến (destination) nếu bản ghi cũ chưa lưu provinceCode
 */
export function detectProvinceFromDestination(destination?: string): ProvinceTaxonomy | undefined {
  if (!destination) return undefined;
  const dNorm = destination.toLowerCase().trim();

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

  return undefined;
}

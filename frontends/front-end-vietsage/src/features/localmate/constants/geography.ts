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

export const REGION_MAP: Record<RegionCode, RegionTaxonomy> = Object.fromEntries(
  REGIONS.map((r) => [r.code, r]),
) as Record<RegionCode, RegionTaxonomy>;

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
 * Suy luận Tỉnh/Thành phố từ Tiêu đề tour (hoặc chuỗi văn bản) nếu bản ghi chưa lưu provinceCode
 */
export function detectProvinceFromDestination(
  titleOrDestination?: string,
  extraText?: string,
): ProvinceTaxonomy | undefined {
  if (!titleOrDestination && !extraText) return undefined;
  const dNorm = (titleOrDestination || "").toLowerCase().trim();
  const tNorm = (extraText || "").toLowerCase().trim();

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

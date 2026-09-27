export type TourScopeType = "LOCAL" | "REGIONAL_DAYTRIP" | "INTERPROVINCIAL";

export interface DestinationTaxonomy {
  code: string;
  name: string;
  keywords: string[];
}

export interface ProvinceTaxonomy {
  code: string;
  name: string;
  aliases: string[];
  destinations: DestinationTaxonomy[];
}

export const GEOGRAPHY_TAXONOMY: Record<string, ProvinceTaxonomy> = {
  LAO_CAI: {
    code: "LAO_CAI",
    name: "Lào Cai",
    aliases: ["lao cai", "lào cai"],
    destinations: [
      {
        code: "SA_PA",
        name: "Sa Pa",
        keywords: [
          "sa pa",
          "sapa",
          "fansipan",
          "phaxipang",
          "hàm rồng",
          "tả van",
          "lao chải",
          "cát cát",
          "mường hoa",
          "ô quy hồ",
          "đèo ô quý hồ",
          "tả phìn",
          "bản đền",
        ],
      },
      {
        code: "BAC_HA",
        name: "Bắc Hà",
        keywords: ["bắc hà", "bac ha", "dinh hoàng a tưởng", "chợ bắc hà", "thải giàng phố"],
      },
      {
        code: "Y_TY",
        name: "Y Tý",
        keywords: ["y tý", "y ty", "lũng pô", "ngải thầu", "bát xát", "bat xat"],
      },
      {
        code: "BAO_YEN",
        name: "Bảo Yên",
        keywords: ["bảo yên", "bao yen", "đền bảo hà", "ông hoàng bảy"],
      },
    ],
  },
  YEN_BAI: {
    code: "YEN_BAI",
    name: "Yên Bái",
    aliases: ["yen bai", "yên bái"],
    destinations: [
      {
        code: "MU_CANG_CHAI",
        name: "Mù Cang Chải",
        keywords: [
          "mù cang chải",
          "mu cang chai",
          "la pán tẩn",
          "la pan tan",
          "chế cu nha",
          "dế xu phình",
          "mâm xôi",
          "móng ngựa",
          "lao chải mù cang chải",
        ],
      },
      {
        code: "TRAM_TAU",
        name: "Trạm Tấu",
        keywords: [
          "trạm tấu",
          "tram tau",
          "khoáng nóng trạm tấu",
          "tà chì nhù",
          "ta chi nhu",
          "tà xùa",
          "bản cu vai",
        ],
      },
      {
        code: "NGHIA_LO",
        name: "Nghĩa Lộ",
        keywords: [
          "nghĩa lộ",
          "nghia lo",
          "mường lò",
          "muong lo",
          "cánh đồng mường lò",
          "chợ mường lò",
        ],
      },
      {
        code: "TU_LE",
        name: "Tú Lệ",
        keywords: [
          "tú lệ",
          "tu le",
          "đèo khau phạ",
          "khau phạ",
          "khau pha",
          "cốm tú lệ",
          "le champ",
        ],
      },
      {
        code: "HO_THAC_BA",
        name: "Hồ Thác Bà",
        keywords: [
          "hồ thác bà",
          "ho thac ba",
          "thác bà",
          "thủy điện thác bà",
          "đảo hoa",
          "đảo thiên đường",
          "đảo xanh",
          "động thủy tiên",
          "vũ linh",
          "ruby",
          "an bình village",
          "bảo ngọc",
          "yên bình",
        ],
      },
      {
        code: "SUOI_GIANG",
        name: "Suối Giàng",
        keywords: [
          "suối giàng",
          "suoi giang",
          "lau camping",
          "chè shan tuyết",
          "rừng chè cổ thụ",
          "động thiên sinh",
        ],
      },
      {
        code: "VAN_CHAN",
        name: "Văn Chấn",
        keywords: [
          "văn chấn",
          "van chan",
          "bản hốc",
          "ban hoc",
          "bản sà rèn",
          "sà rèn",
          "suối nước nóng bản hốc",
        ],
      },
    ],
  },
  HA_NOI: {
    code: "HA_NOI",
    name: "Hà Nội",
    aliases: ["ha noi", "hà nội", "hanoi"],
    destinations: [
      {
        code: "HOAN_KIEM",
        name: "Hoàn Kiếm & Phố Cổ",
        keywords: ["hoàn kiếm", "hồ gươm", "phố cổ", "36 phố phường", "tràng tiền"],
      },
      {
        code: "BA_DINH",
        name: "Ba Đình",
        keywords: ["ba đình", "lăng bác", "hoàng thành thăng long", "chùa một cột"],
      },
      {
        code: "TAY_HO",
        name: "Tây Hồ",
        keywords: ["tây hồ", "hồ tây", "chùa trấn quốc", "phủ tây hồ"],
      },
      {
        code: "BA_VI",
        name: "Ba Vì",
        keywords: ["ba vì", "vườn quốc gia ba vì", "khoang xanh", "ao vua"],
      },
      {
        code: "SOC_SON",
        name: "Sóc Sơn",
        keywords: ["sóc sơn", "đền sóc", "hồ đồng đò", "hồ hàm lợn"],
      },
      {
        code: "DUONG_LAM",
        name: "Đường Lâm",
        keywords: ["đường lâm", "làng cổ đường lâm", "sơn tây"],
      },
      {
        code: "BAT_TRANG",
        name: "Bát Tràng",
        keywords: ["bát tràng", "gốm bát tràng", "gia lâm"],
      },
    ],
  },
  DA_NANG: {
    code: "DA_NANG",
    name: "Đà Nẵng",
    aliases: ["da nang", "đà nẵng", "danang"],
    destinations: [
      {
        code: "BA_NA",
        name: "Bà Nà Hills",
        keywords: ["bà nà", "ba na hills", "cầu vàng", "golden bridge"],
      },
      {
        code: "SON_TRA",
        name: "Sơn Trà",
        keywords: ["sơn trà", "bán đảo sơn trà", "chùa linh ứng", "đỉnh bàn cờ"],
      },
      {
        code: "NGU_HANH_SON",
        name: "Ngũ Hành Sơn",
        keywords: ["ngũ hành sơn", "chùa tam thai", "động huyền không"],
      },
      {
        code: "MY_KHE",
        name: "Mỹ Khê",
        keywords: ["mỹ khê", "bãi biển mỹ khê", "sông hàn", "cầu rồng"],
      },
    ],
  },
  QUANG_NAM: {
    code: "QUANG_NAM",
    name: "Quảng Nam",
    aliases: ["quang nam", "quảng nam"],
    destinations: [
      {
        code: "HOI_AN",
        name: "Hội An",
        keywords: ["hội an", "hoi an", "phố cổ hội an", "chùa cầu", "rừng dừa bảy mẫu"],
      },
      {
        code: "CU_LAO_CHAM",
        name: "Cù Lao Chàm",
        keywords: ["cù lao chàm", "cu lao cham"],
      },
      {
        code: "MY_SON",
        name: "Mỹ Sơn",
        keywords: ["mỹ sơn", "my son", "thánh địa mỹ sơn"],
      },
    ],
  },
  HO_CHI_MINH: {
    code: "HO_CHI_MINH",
    name: "Hồ Chí Minh",
    aliases: ["ho chi minh", "hồ chí minh", "hcm", "sài gòn", "sai gon", "tphcm"],
    destinations: [
      {
        code: "SAI_GON_CENTER",
        name: "Trung tâm Sài Gòn",
        keywords: [
          "quận 1",
          "quận 3",
          "chợ bến thành",
          "dinh độc lập",
          "nhà thờ đức bà",
          "phố đi bộ nguyễn huệ",
          "bưu điện trung tâm",
        ],
      },
      {
        code: "CU_CHI",
        name: "Củ Chi",
        keywords: ["củ chi", "cu chi", "địa đạo củ chi"],
      },
      {
        code: "CAN_GIO",
        name: "Cần Giờ",
        keywords: ["cần giờ", "can gio", "rừng sác", "đảo khỉ"],
      },
    ],
  },
  KIEN_GIANG: {
    code: "KIEN_GIANG",
    name: "Kiên Giang",
    aliases: ["kien giang", "kiên giang"],
    destinations: [
      {
        code: "PHU_QUOC",
        name: "Phú Quốc",
        keywords: [
          "phú quốc",
          "phu quoc",
          "hòn thơm",
          "grand world",
          "sunset sanato",
          "bãi sao",
          "an thới",
          "dương đông",
        ],
      },
      {
        code: "NAM_DU",
        name: "Nam Du",
        keywords: ["nam du", "quần đảo nam du"],
      },
      {
        code: "HA_TIEN",
        name: "Hà Tiên",
        keywords: ["hà tiên", "ha tien", "mũi nai", "thạch động"],
      },
      {
        code: "RACH_GIA",
        name: "Rạch Giá",
        keywords: ["rạch giá", "rach gia"],
      },
    ],
  },
};

export interface InferredProvinceAndScope {
  provinceCode: string;
  province: string;
  tourScope: TourScopeType;
}

/**
 * Infer Province and TourScope from tour title (or destination) text.
 */
export function inferProvinceAndScope(
  titleOrDestination: string,
  extraText?: string,
): InferredProvinceAndScope {
  const combinedText = `${titleOrDestination || ""} ${extraText || ""}`.toLowerCase();
  const destOnly = (titleOrDestination || "").toLowerCase();

  // Find all matched provinces
  const matchedProvinces = new Set<string>();
  const matchedDestinationsByProvince = new Map<string, Set<string>>();

  for (const [code, prov] of Object.entries(GEOGRAPHY_TAXONOMY)) {
    // Check province aliases in combined text
    const matchesProvince = prov.aliases.some((alias) => combinedText.includes(alias));
    if (matchesProvince) {
      matchedProvinces.add(code);
    }

    // Check destinations
    for (const d of prov.destinations) {
      const destMatch = d.keywords.some((kw) => combinedText.includes(kw));
      if (destMatch) {
        matchedProvinces.add(code);
        if (!matchedDestinationsByProvince.has(code)) {
          matchedDestinationsByProvince.set(code, new Set());
        }
        matchedDestinationsByProvince.get(code)!.add(d.code);
      }
    }
  }

  // If multiple provinces matched -> INTERPROVINCIAL
  if (matchedProvinces.size > 1) {
    // Pick the primary destination province (prioritizing the one matched in `destination` or non-capital/route target)
    let primaryProvinceCode: string | undefined;
    // Check if destOnly specifically matches any province
    for (const code of matchedProvinces) {
      const prov = GEOGRAPHY_TAXONOMY[code];
      const inDest =
        prov.aliases.some((a) => destOnly.includes(a)) ||
        prov.destinations.some((d) => d.keywords.some((kw) => destOnly.includes(kw)));
      if (inDest && code !== "HA_NOI" && code !== "HO_CHI_MINH") {
        primaryProvinceCode = code;
        break;
      }
    }

    const resolvedProvinceCode = primaryProvinceCode ?? Array.from(matchedProvinces)[0];
    const provinceName = GEOGRAPHY_TAXONOMY[resolvedProvinceCode]?.name ?? "Chưa phân loại";

    return {
      provinceCode: resolvedProvinceCode,
      province: provinceName,
      tourScope: "INTERPROVINCIAL",
    };
  }

  // Single province matched.
  if (matchedProvinces.size === 1) {
    const singleCode = Array.from(matchedProvinces)[0];
    const prov = GEOGRAPHY_TAXONOMY[singleCode];
    const matchedDestinations = matchedDestinationsByProvince.get(singleCode)?.size ?? 0;
    const isMultiDay = /\b[2345]n[1234]đ\b/i.test(combinedText);

    return {
      provinceCode: singleCode,
      province: prov.name,
      tourScope: matchedDestinations >= 2 || isMultiDay ? "REGIONAL_DAYTRIP" : "LOCAL",
    };
  }

  // Never assign an arbitrary province when taxonomy inference has no evidence.
  return {
    provinceCode: "UNCLASSIFIED",
    province: "Chưa phân loại",
    tourScope: "LOCAL",
  };
}

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

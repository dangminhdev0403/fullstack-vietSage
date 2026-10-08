import type { LocalMateTourScope } from "../types";

export type {
  RegionCode,
  RegionTaxonomy,
  ProvinceTaxonomy,
} from "@/features/localmate/constants/geography";

export {
  REGIONS,
  PROVINCES,
  REGION_MAP,
  PROVINCE_MAP,
  getProvincesByRegion,
  detectProvinceFromDestination,
} from "@/features/localmate/constants/geography";

export interface TourScopeDefinition {
  value: LocalMateTourScope;
  label: string;
  shortLabel: string;
  badgeClass: string;
  description: string;
}

export const TOUR_SCOPES: TourScopeDefinition[] = [
  {
    value: "LOCAL",
    label: "Nội tỉnh",
    shortLabel: "Nội tỉnh",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
    description: "Khám phá và trải nghiệm các điểm đến trong cùng một tỉnh/thành",
  },
  {
    value: "REGIONAL_DAYTRIP",
    label: "Liên điểm nội tỉnh",
    shortLabel: "Nội tỉnh mở rộng",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200/80",
    description: "Tuyến đi qua nhiều điểm trong cùng một tỉnh/thành",
  },
  {
    value: "INTERPROVINCIAL",
    label: "Tuyến liên tỉnh",
    shortLabel: "Liên tỉnh",
    badgeClass: "bg-sky-50 text-sky-800 border-sky-200/80",
    description: "Hành trình dài di chuyển xuyên tỉnh hoặc liên kết nhiều tỉnh",
  },
];

export const TOUR_SCOPE_MAP: Record<LocalMateTourScope, TourScopeDefinition> = {
  LOCAL: TOUR_SCOPES[0],
  REGIONAL_DAYTRIP: TOUR_SCOPES[1],
  INTERPROVINCIAL: TOUR_SCOPES[2],
};

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

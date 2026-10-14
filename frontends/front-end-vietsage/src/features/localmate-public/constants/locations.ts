export interface PublicLocalMateDestination {
  order: number;
  provinceCode: string;
  label: string;
  location: string;
  icon: string;
}

export const PUBLIC_LOCALMATE_DESTINATIONS: readonly PublicLocalMateDestination[] = [
  {
    order: 1,
    provinceCode: "LAO_CAI",
    label: "Lào Cai",
    location: "Lào Cai",
    icon: "🏔️",
  },
  {
    order: 2,
    provinceCode: "HA_NOI",
    label: "Hà Nội",
    location: "Hà Nội",
    icon: "🏛️",
  },
  {
    order: 3,
    provinceCode: "DA_NANG",
    label: "Đà Nẵng",
    location: "Đà Nẵng",
    icon: "🌉",
  },
  {
    order: 4,
    provinceCode: "QUANG_NAM",
    label: "Quảng Nam",
    location: "Quảng Nam",
    icon: "🏮",
  },
  {
    order: 5,
    provinceCode: "HO_CHI_MINH",
    label: "TP. Hồ Chí Minh",
    location: "TP. Hồ Chí Minh",
    icon: "🏙️",
  },
  {
    order: 6,
    provinceCode: "KIEN_GIANG",
    label: "Kiên Giang",
    location: "Kiên Giang",
    icon: "🏝️",
  },
] as const;

export const DESTINATION_I18N: Record<
  string,
  Record<string, string>
> = {
  vi: {
    LAO_CAI: "Lào Cai",
    HA_NOI: "Hà Nội",
    DA_NANG: "Đà Nẵng",
    QUANG_NAM: "Quảng Nam",
    HO_CHI_MINH: "TP. Hồ Chí Minh",
    KIEN_GIANG: "Kiên Giang",
  },
  en: {
    LAO_CAI: "Lao Cai",
    HA_NOI: "Hanoi",
    DA_NANG: "Da Nang",
    QUANG_NAM: "Quang Nam",
    HO_CHI_MINH: "Ho Chi Minh City",
    KIEN_GIANG: "Kien Giang",
  },
  zh: {
    LAO_CAI: "老街",
    HA_NOI: "河内",
    DA_NANG: "岘港",
    QUANG_NAM: "广南",
    HO_CHI_MINH: "胡志明市",
    KIEN_GIANG: "坚江",
  },
  ko: {
    LAO_CAI: "라오까이",
    HA_NOI: "하노이",
    DA_NANG: "다낭",
    QUANG_NAM: "꽝남",
    HO_CHI_MINH: "호치민시",
    KIEN_GIANG: "끼엔장",
  },
  ru: {
    LAO_CAI: "Лаокай",
    HA_NOI: "Ханой",
    DA_NANG: "Дананг",
    QUANG_NAM: "Куангнам",
    HO_CHI_MINH: "Хошимин",
    KIEN_GIANG: "Киензянг",
  },
  hi: {
    LAO_CAI: "लाओ काई",
    HA_NOI: "हनोई",
    DA_NANG: "दा नांग",
    QUANG_NAM: "क्वांग नाम",
    HO_CHI_MINH: "हो ची मिन्ह सिटी",
    KIEN_GIANG: "किएन गियांग",
  },
};

export function getLocalizedDestinations(
  locale: string,
): readonly PublicLocalMateDestination[] {
  const i18n = DESTINATION_I18N[locale] ?? DESTINATION_I18N.vi;
  return PUBLIC_LOCALMATE_DESTINATIONS.map((dest) => {
    const label = i18n[dest.provinceCode];
    if (!label) return dest;
    return {
      ...dest,
      label,
    };
  });
}

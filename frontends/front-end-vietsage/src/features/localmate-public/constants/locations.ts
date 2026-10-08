export interface PublicLocalMateDestination {
  order: number;
  provinceCode: string;
  label: string;
  location: string;
  tag: string;
  icon: string;
}

export const PUBLIC_LOCALMATE_DESTINATIONS: readonly PublicLocalMateDestination[] = [
  {
    order: 1,
    provinceCode: "LAO_CAI",
    label: "Lào Cai – Sa Pa",
    location: "Sa Pa, Lào Cai",
    tag: "Săn mây Tây Bắc",
    icon: "🏔️",
  },
  {
    order: 2,
    provinceCode: "HA_NOI",
    label: "Hà Nội",
    location: "Hà Nội",
    tag: "Thủ đô di sản",
    icon: "🏛️",
  },
  {
    order: 3,
    provinceCode: "DA_NANG",
    label: "Đà Nẵng",
    location: "Đà Nẵng",
    tag: "Thành phố biển",
    icon: "🌉",
  },
  {
    order: 4,
    provinceCode: "QUANG_NAM",
    label: "Quảng Nam – Hội An",
    location: "Hội An, Quảng Nam",
    tag: "Phố cổ di sản",
    icon: "🏮",
  },
  {
    order: 5,
    provinceCode: "HO_CHI_MINH",
    label: "TP. Hồ Chí Minh",
    location: "TP. Hồ Chí Minh",
    tag: "Trung tâm sôi động",
    icon: "🏙️",
  },
  {
    order: 6,
    provinceCode: "KIEN_GIANG",
    label: "Phú Quốc – Kiên Giang",
    location: "Phú Quốc, Kiên Giang",
    tag: "Đảo ngọc nghỉ dưỡng",
    icon: "🏝️",
  },
] as const;

export const DESTINATION_I18N: Record<
  string,
  Record<string, { label: string; tag: string }>
> = {
  vi: {
    LAO_CAI: { label: "Lào Cai – Sa Pa", tag: "Săn mây Tây Bắc" },
    HA_NOI: { label: "Hà Nội", tag: "Thủ đô di sản" },
    DA_NANG: { label: "Đà Nẵng", tag: "Thành phố biển" },
    QUANG_NAM: { label: "Quảng Nam – Hội An", tag: "Phố cổ di sản" },
    HO_CHI_MINH: { label: "TP. Hồ Chí Minh", tag: "Trung tâm sôi động" },
    KIEN_GIANG: { label: "Phú Quốc – Kiên Giang", tag: "Đảo ngọc nghỉ dưỡng" },
  },
  en: {
    LAO_CAI: { label: "Lao Cai – Sa Pa", tag: "Northwest Cloud Hunting" },
    HA_NOI: { label: "Hanoi", tag: "Heritage Capital" },
    DA_NANG: { label: "Da Nang", tag: "Coastal City" },
    QUANG_NAM: { label: "Quang Nam – Hoi An", tag: "Heritage Ancient Town" },
    HO_CHI_MINH: { label: "Ho Chi Minh City", tag: "Vibrant Megacity" },
    KIEN_GIANG: { label: "Phu Quoc – Kien Giang", tag: "Pearl Island Retreat" },
  },
  zh: {
    LAO_CAI: { label: "老街 – 沙坝", tag: "西北云海仙境" },
    HA_NOI: { label: "河内", tag: "千年历史古都" },
    DA_NANG: { label: "岘港", tag: "美丽海滨名城" },
    QUANG_NAM: { label: "广南 – 会安", tag: "古镇世界遗产" },
    HO_CHI_MINH: { label: "胡志明市", tag: "繁华活力都会" },
    KIEN_GIANG: { label: "富国岛 – 坚江", tag: "度假珍珠之岛" },
  },
  ko: {
    LAO_CAI: { label: "라오까이 – 사파", tag: "서북부 운해 명소" },
    HA_NOI: { label: "하노이", tag: "천년 역사의 수도" },
    DA_NANG: { label: "다낭", tag: "아름다운 해변 도시" },
    QUANG_NAM: { label: "꽝남 – 호이안", tag: "유네스코 고대 도시" },
    HO_CHI_MINH: { label: "호치민시", tag: "활력 넘치는 대도시" },
    KIEN_GIANG: { label: "푸꾸옥 – 끼엔장", tag: "휴양의 진주 섬" },
  },
  ru: {
    LAO_CAI: { label: "Лаокай – Сапа", tag: "Охота за облаками" },
    HA_NOI: { label: "Ханой", tag: "Историческая столица" },
    DA_NANG: { label: "Дананг", tag: "Приморский город" },
    QUANG_NAM: { label: "Куангнам – Хойан", tag: "Древний город-памятник" },
    HO_CHI_MINH: { label: "Хошимин", tag: "Динамичный мегаполис" },
    KIEN_GIANG: { label: "Фукуок – Киензянг", tag: "Жемчужный остров" },
  },
  hi: {
    LAO_CAI: { label: "लाओ काई – सा पा", tag: "उत्तर-पश्चिम बादलों की सैर" },
    HA_NOI: { label: "हनोई", tag: "ऐतिहासिक राजधानी" },
    DA_NANG: { label: "दा नांग", tag: "तटीय शहर" },
    QUANG_NAM: { label: "क्वांग नाम – होई आन", tag: "प्राचीन धरोहर शहर" },
    HO_CHI_MINH: { label: "हो ची मिन्ह सिटी", tag: "जीवंत महानगर" },
    KIEN_GIANG: { label: "फू क्वोक – किएन गियांग", tag: "पर्ल आइलैंड रिट्रीट" },
  },
};

export function getLocalizedDestinations(
  locale: string,
): readonly PublicLocalMateDestination[] {
  const i18n = DESTINATION_I18N[locale] ?? DESTINATION_I18N.vi;
  return PUBLIC_LOCALMATE_DESTINATIONS.map((dest) => {
    const item = i18n[dest.provinceCode];
    if (!item) return dest;
    return {
      ...dest,
      label: item.label,
      tag: item.tag,
    };
  });
}

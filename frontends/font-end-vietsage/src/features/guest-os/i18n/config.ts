export const guestLocales = ["vi", "en", "zh", "ko", "ru", "hi"] as const;

export type GuestLocale = (typeof guestLocales)[number];

export const defaultGuestLocale: GuestLocale = "vi";

export const guestLocaleOptions: Array<{
  code: GuestLocale;
  nativeName: string;
  englishName: string;
  badge: string;
}> = [
  { code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese", badge: "VI" },
  { code: "en", nativeName: "English", englishName: "English", badge: "EN" },
  { code: "zh", nativeName: "中文", englishName: "Chinese", badge: "ZH" },
  { code: "ko", nativeName: "한국어", englishName: "Korean", badge: "KO" },
  { code: "ru", nativeName: "Русский", englishName: "Russian", badge: "RU" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi", badge: "HI" },
];

export function normalizeGuestLocale(value: string | null | undefined): GuestLocale {
  const normalized = value?.trim().toLowerCase().replace("_", "-") ?? "";
  if (normalized.startsWith("zh")) return "zh";
  if (normalized.startsWith("ko")) return "ko";
  if (normalized.startsWith("ru")) return "ru";
  if (normalized.startsWith("hi")) return "hi";
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("vi")) return "vi";
  return defaultGuestLocale;
}

export function guestIntlLocale(locale: GuestLocale): string {
  return {
    vi: "vi-VN",
    en: "en-US",
    zh: "zh-CN",
    ko: "ko-KR",
    ru: "ru-RU",
    hi: "hi-IN",
  }[locale];
}

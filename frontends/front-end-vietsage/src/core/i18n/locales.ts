export const SUPPORTED_LOCALES = ["vi", "en", "zh", "ko", "ru", "hi"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "vi";

export interface LocaleOption {
  code: SupportedLocale;
  nativeName: string;
  englishName: string;
  badge: string;
  flag: string;
  intlLocale: string;
}

export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { code: "vi", nativeName: "Tiếng Việt", englishName: "Vietnamese", badge: "VI", flag: "🇻🇳", intlLocale: "vi-VN" },
  { code: "en", nativeName: "English", englishName: "English", badge: "EN", flag: "🇬🇧", intlLocale: "en-US" },
  { code: "zh", nativeName: "中文", englishName: "Chinese", badge: "ZH", flag: "🇨🇳", intlLocale: "zh-CN" },
  { code: "ko", nativeName: "한국어", englishName: "Korean", badge: "KO", flag: "🇰🇷", intlLocale: "ko-KR" },
  { code: "ru", nativeName: "Русский", englishName: "Russian", badge: "RU", flag: "🇷🇺", intlLocale: "ru-RU" },
  { code: "hi", nativeName: "हिन्दी", englishName: "Hindi", badge: "HI", flag: "🇮🇳", intlLocale: "hi-IN" },
];

export function normalizeLocale(value: string | null | undefined): SupportedLocale {
  const normalized = value?.trim().toLowerCase().replace("_", "-") ?? "";
  if (normalized.startsWith("zh")) return "zh";
  if (normalized.startsWith("ko")) return "ko";
  if (normalized.startsWith("ru")) return "ru";
  if (normalized.startsWith("hi")) return "hi";
  if (normalized.startsWith("en")) return "en";
  if (normalized.startsWith("vi")) return "vi";
  return DEFAULT_LOCALE;
}

export function getIntlLocale(locale: SupportedLocale): string {
  switch (locale) {
    case "vi":
      return "vi-VN";
    case "en":
      return "en-US";
    case "zh":
      return "zh-CN";
    case "ko":
      return "ko-KR";
    case "ru":
      return "ru-RU";
    case "hi":
      return "hi-IN";
    default:
      return "vi-VN";
  }
}

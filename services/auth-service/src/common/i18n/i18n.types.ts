export const SUPPORTED_LOCALES = ["vi-VN", "en", "zh", "ko", "ru", "hi"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: SupportedLocale = "vi-VN";

export const CONTENT_TRANSLATION_LOCALES = ["en", "zh", "ko", "ru", "hi"] as const;

export type ContentTranslationLocale = (typeof CONTENT_TRANSLATION_LOCALES)[number];

export type TranslationParams = Record<string, string | number | boolean | null | undefined>;
